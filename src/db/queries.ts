import { getDb } from './schema';
import { enqueueAction } from './actionQueue';
import type { UserProfile, DailyAnchor, DoseLog, ScheduleRule, Supplement, DaySummary, ScheduledDose, JournalEntry, RelapseEvent, MedicalEvent } from '../types';

export function localDateStr(d: Date): string {
  // Local calendar date (YYYY-MM-DD). Used everywhere data is keyed by day so
  // writes (todayStr) and the History grid agree in UTC+1/+2 (Europe/Berlin).
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function todayStr(): string {
  return localDateStr(new Date());
}

// ── User Profile ─────────────────────────────────────────────────────────────

export async function getProfile(): Promise<UserProfile | null> {
  const db = await getDb();
  return db.getFirstAsync<UserProfile>('SELECT * FROM user_profile WHERE id = 1');
}

// Whitelisted columns for updateProfile — defensive against runtime callers
// that bypass the TypeScript Partial<UserProfile> constraint. setClauses below
// interpolates these keys directly into SQL, so the whitelist is the safety
// barrier; values are always parameterized.
const UPDATE_PROFILE_ALLOWED = new Set<keyof UserProfile>([
  'name', 'weight_kg', 'start_date', 'timezone', 'bedtime_hour', 'bedtime_minute',
]);

export async function updateProfile(fields: Partial<UserProfile>): Promise<void> {
  const db = await getDb();
  const entries = Object.entries(fields).filter(
    ([k]) => UPDATE_PROFILE_ALLOWED.has(k as keyof UserProfile)
  );
  if (!entries.length) return;
  const setClauses = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => v);
  await db.runAsync(`UPDATE user_profile SET ${setClauses} WHERE id = 1`, values);
}

// ── Daily Anchor (T=0) ────────────────────────────────────────────────────────

export async function getAnchor(date: string = todayStr()): Promise<DailyAnchor | null> {
  const db = await getDb();
  return db.getFirstAsync<DailyAnchor>(
    'SELECT * FROM daily_anchors WHERE date = ?',
    [date]
  );
}

export async function setT0(timestamp: number, date: string = todayStr()): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO daily_anchors (date, t0_timestamp, water_ml)
     VALUES (?, ?, 0)
     ON CONFLICT(date) DO UPDATE SET t0_timestamp = excluded.t0_timestamp`,
    [date, timestamp]
  );
}

export async function addWater(amount_ml: number, date: string = todayStr()): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
  await db.runAsync(
      `INSERT INTO daily_anchors (date, t0_timestamp, water_ml)
       VALUES (?, NULL, ?)
       ON CONFLICT(date) DO UPDATE SET water_ml = water_ml + excluded.water_ml`,
      [date, amount_ml]
    );
  await db.runAsync(
      'INSERT INTO water_logs (date, amount_ml, logged_at) VALUES (?, ?, ?)',
      [date, amount_ml, Date.now()]
    );
  });
}

/**
 * Water and sun were INSERT-only: `addWater` and `logSunExposure` were the only
 * writers against `water_logs` / `sun_log` anywhere in src/, so a mis-tap — 750 ml
 * logged instead of 250, six taps instead of one — was permanent for that day.
 *
 * `daily_anchors.water_ml` is the running total the UI reads and `water_logs`
 * holds the individual entries, so every correction below moves both inside one
 * transaction. A total that disagrees with the sum of its entries is worse than
 * the mis-tap it came from.
 */
export async function undoLastWater(date: string = todayStr()): Promise<number | null> {
  const db = await getDb();
  const last = await db.getFirstAsync<{ id: number; amount_ml: number }>(
    'SELECT id, amount_ml FROM water_logs WHERE date = ? ORDER BY logged_at DESC, id DESC LIMIT 1',
    [date]
  );
  if (!last) return null;
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM water_logs WHERE id = ?', [last.id]);
    // MAX(0, …) because the anchor is the number on screen: a negative total
    // would render, and would be a second bug reported as the first one.
    await db.runAsync(
      'UPDATE daily_anchors SET water_ml = MAX(0, water_ml - ?) WHERE date = ?',
      [last.amount_ml, date]
    );
  });
  return last.amount_ml;
}

/** Correct one entry in place, moving the day's total by the difference. */
export async function correctWaterLog(logId: number, amount_ml: number): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ date: string; amount_ml: number }>(
    'SELECT date, amount_ml FROM water_logs WHERE id = ?',
    [logId]
  );
  if (!row) return;
  const next = Math.max(0, Math.round(amount_ml));
  const delta = next - row.amount_ml;
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE water_logs SET amount_ml = ? WHERE id = ?', [next, logId]);
    await db.runAsync(
      'UPDATE daily_anchors SET water_ml = MAX(0, water_ml + ?) WHERE date = ?',
      [delta, row.date]
    );
  });
}

/** Every entry for the day, newest first — what a correction screen lists. */
export async function getWaterLogs(
  date: string = todayStr()
): Promise<{ id: number; amount_ml: number; logged_at: number }[]> {
  const db = await getDb();
  return db.getAllAsync(
    'SELECT id, amount_ml, logged_at FROM water_logs WHERE date = ? ORDER BY logged_at DESC, id DESC',
    [date]
  );
}

/**
 * Sun is stored as one aggregated row per day (`sun_log.date` is UNIQUE), so
 * there is no last entry to remove the way there is for water — correcting sun
 * means setting the day's total. This clears the day back to nothing.
 */
export async function clearSunLog(date: string = todayStr()): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM sun_log WHERE date = ?', [date]);
}

/**
 * Set a day's sun total, including a day that is not today.
 *
 * `setSunExposure` already writes the total outright, but it computes its own
 * `todayStr()` and takes no date — so yesterday's mis-tap could not be corrected
 * at all, only today's. That is the whole gap this fills: the same write, against
 * a named date. Water gets `correctWaterLog(logId, …)` because it keeps one row
 * per entry; sun keeps one row per day, so the day *is* the unit of correction
 * and there is no id to address.
 *
 * `notes` left undefined keeps whatever the row already says; passing `''` is a
 * deliberate erase. The two must not collapse into each other — correcting the
 * minutes should not silently wipe the note explaining the day.
 */
export async function correctSunLog(
  minutes: number,
  date: string = todayStr(),
  notes?: string
): Promise<void> {
  const db = await getDb();
  const next = Math.max(0, Math.round(minutes));
  if (notes === undefined) {
    await db.runAsync(
      `INSERT INTO sun_log (date, minutes, uv_index, notes)
       VALUES (?, ?, NULL, '')
       ON CONFLICT(date) DO UPDATE SET minutes = excluded.minutes`,
      [date, next]
    );
    return;
  }
  await db.runAsync(
    `INSERT INTO sun_log (date, minutes, uv_index, notes)
     VALUES (?, ?, NULL, ?)
     ON CONFLICT(date) DO UPDATE SET minutes = excluded.minutes, notes = excluded.notes`,
    [date, next, notes]
  );
}

// ── Schedule Rules ────────────────────────────────────────────────────────────

export async function getScheduleRules(): Promise<(ScheduleRule & { supplement_name: string; supplement_form: string; notes: string })[]> {
  const db = await getDb();
  return db.getAllAsync<ScheduleRule & { supplement_name: string; supplement_form: string; notes: string }>(
    `SELECT sr.*, s.name as supplement_name, s.form as supplement_form, s.notes
     FROM schedule_rules sr
     JOIN supplements s ON sr.supplement_id = s.id
     ORDER BY sr.display_order ASC`
  );
}

export async function updateRuleDose(ruleId: number, doseAmount: string, doseUnit: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE schedule_rules SET dose_amount = ?, dose_unit = ? WHERE id = ?',
    [doseAmount, doseUnit, ruleId]
  );
}

export async function updateRuleTolerance(ruleId: number, toleranceMinutes: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE schedule_rules SET tolerance_window = ? WHERE id = ?',
    [toleranceMinutes, ruleId]
  );
}

export async function getScheduleRulesWithNames(): Promise<{ id: number; supplement_name: string; tolerance_window: number }[]> {
  const db = await getDb();
  return db.getAllAsync<{ id: number; supplement_name: string; tolerance_window: number }>(
    `SELECT sr.id, s.name as supplement_name, sr.tolerance_window
     FROM schedule_rules sr
     JOIN supplements s ON sr.supplement_id = s.id
     ORDER BY sr.display_order`
  );
}

// ── Dose Logs ─────────────────────────────────────────────────────────────────

export async function createDoseLogs(
  doses: Array<{ supplement_id: string; rule_id: number; scheduled_time: number }>,
  date: string = todayStr()
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    // Clear any existing upcoming logs for today (in case of re-start)
  await db.runAsync(
      "DELETE FROM dose_logs WHERE date = ? AND status = 'upcoming'",
      [date]
    );
    for (const d of doses) {
  await db.runAsync(
        `INSERT INTO dose_logs (date, supplement_id, rule_id, scheduled_time, status)
         VALUES (?, ?, ?, ?, 'upcoming')`,
        [date, d.supplement_id, d.rule_id, d.scheduled_time]
      );
    }
  });
}

export async function getDoseLogs(date: string = todayStr()): Promise<(DoseLog & { supplement_name: string; supplement_form: string; supplement_notes: string; dose_amount: string; with_food: number; tolerance_window: number; skip_reason: string | null })[]> {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT dl.*, s.name as supplement_name, s.form as supplement_form,
            s.notes as supplement_notes, sr.dose_amount, sr.with_food, sr.tolerance_window
     FROM dose_logs dl
     JOIN supplements s ON dl.supplement_id = s.id
     JOIN schedule_rules sr ON dl.rule_id = sr.id
     WHERE dl.date = ?
     ORDER BY dl.scheduled_time ASC`,
    [date]
  );
}

/**
 * The row a dose action is about to change, plus the two things every one of
 * them needs to get right: the pill count and the timestamp.
 *
 * A dose can now be corrected long after the fact (round 3, A4), so an action
 * is no longer the first thing that ever happened to the row. Two rules follow:
 *
 *  - Stock follows 'taken', and only 'taken'. Entering it takes a pill out of
 *    the bottle, leaving it puts one back, and re-confirming an already-taken
 *    dose changes nothing. Before this, skipping a dose decremented stock as if
 *    it had been swallowed, and correcting a dose back and forth drained the
 *    bottle a pill per tap.
 *  - `logged_time` is stamped now only while the dose's own day is still today.
 *    Correcting a dose from three weeks ago cannot claim it was taken at this
 *    minute; the scheduled time is the only defensible answer, and it is what
 *    the calendar's day detail renders.
 */
async function applyDoseStatus(
  logId: number,
  status: 'taken' | 'skipped',
  reason?: string,
): Promise<{ supplement_id: string; date: string } | null> {
  const db = await getDb();
  const log = await db.getFirstAsync<{ supplement_id: string; date: string; status: string; scheduled_time: number }>(
    'SELECT supplement_id, date, status, scheduled_time FROM dose_logs WHERE id = ?',
    [logId],
  );
  if (!log) return null;

  const loggedTime = log.date === todayStr() ? Date.now() : log.scheduled_time;
  if (reason === undefined) {
    await db.runAsync('UPDATE dose_logs SET status = ?, logged_time = ? WHERE id = ?', [status, loggedTime, logId]);
  } else {
    await db.runAsync(
      'UPDATE dose_logs SET status = ?, logged_time = ?, skip_reason = ? WHERE id = ?',
      [status, loggedTime, reason, logId],
    );
  }

  const wasTaken = log.status === 'taken';
  if (status === 'taken' && !wasTaken) await decrementQuantity(log.supplement_id);
  if (status !== 'taken' && wasTaken) await incrementQuantity(log.supplement_id);

  return { supplement_id: log.supplement_id, date: log.date };
}

export async function confirmDose(logId: number): Promise<void> {
  const log = await applyDoseStatus(logId, 'taken');
  if (log) await enqueueAction('dose_confirmed', { supplement_id: log.supplement_id, date: log.date, time: new Date().toISOString() });
}

export async function skipDose(logId: number): Promise<void> {
  const log = await applyDoseStatus(logId, 'skipped');
  if (log) await enqueueAction('dose_skipped', { supplement_id: log.supplement_id, date: log.date, time: new Date().toISOString() });
}

export async function skipDoseWithReason(logId: number, reason: string): Promise<void> {
  const log = await applyDoseStatus(logId, 'skipped', reason);
  if (log) await enqueueAction('dose_skipped', { supplement_id: log.supplement_id, date: log.date, time: new Date().toISOString(), reason });
}

export async function markOverdueDoses(date: string = todayStr()): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync(
    `UPDATE dose_logs
     SET status = 'missed'
     WHERE date = ? AND status = 'upcoming' AND scheduled_time < ?`,
    [date, now - 30 * 60 * 1000] // 30min grace period
  );
}

// ── Summary ───────────────────────────────────────────────────────────────────

export async function getDaySummary(date: string = todayStr()): Promise<DaySummary> {
  const db = await getDb();

  const anchor = await getAnchor(date);
  const logs = await db.getAllAsync<{ status: string; count: number }>(
    "SELECT status, COUNT(*) as count FROM dose_logs WHERE date = ? GROUP BY status",
    [date]
  );

  // Every status the table can hold has to be listed here: the total is summed
  // from these keys, so a status missing from the object silently leaves the
  // denominator and moves compliance. The other aggregates (getCalendarRange,
  // getStreak, getWeightedAdherenceScore) count rows, so they needed nothing.
  const counts = { taken: 0, missed: 0, skipped: 0, upcoming: 0, due: 0 };
  for (const row of logs) {
    counts[row.status as keyof typeof counts] = row.count;
  }

  const total = counts.taken + counts.missed + counts.skipped + counts.upcoming + counts.due;
  // A deliberate skip still counts against adherence, exactly as it did when it
  // was stored as 'missed' — Cedric's call, 2026-09-13. Moving it out of the
  // denominator is a one-line change here and a re-read of every chart.
  const compliancePct = total > 0 ? Math.round((counts.taken / total) * 100) : 0;

  return {
    totalDoses: total,
    takenDoses: counts.taken,
    missedDoses: counts.missed + counts.skipped,
    skippedDoses: counts.skipped,
    compliancePct,
    waterMl: anchor?.water_ml ?? 0,
    t0: anchor?.t0_timestamp ? new Date(anchor.t0_timestamp) : null,
  };
}

export interface CalendarDay {
  date: string;
  totalDoses: number;
  takenDoses: number;
  compliancePct: number;
  eventCount: number;
  hasJournal: boolean;
  hasWater: boolean;
  started: boolean;
}

// Aggregates a whole month in a few range queries (like the PWA's dayMap), NOT
// one query per day. Critically, a day counts as data if it has ANY dose, event,
// journal entry, water, or started anchor — so event-only days are visible and
// clickable on the grid (the bug the dose-only getDaySummary caused).
export async function getCalendarMonth(year: number, month: number): Promise<Map<string, CalendarDay>> {
  const db = await getDb();
  const mm = String(month + 1).padStart(2, '0');
  const start = `${year}-${mm}-01`;
  const endDay = new Date(year, month + 1, 0).getDate();
  const end = `${year}-${mm}-${String(endDay).padStart(2, '0')}`;

  const map = new Map<string, CalendarDay>();
  const ensure = (d: string): CalendarDay => {
    let c = map.get(d);
    if (!c) {
      c = { date: d, totalDoses: 0, takenDoses: 0, compliancePct: 0, eventCount: 0, hasJournal: false, hasWater: false, started: false };
      map.set(d, c);
    }
    return c;
  };

  const doseRows = await db.getAllAsync<{ date: string; status: string; c: number }>(
    'SELECT date, status, COUNT(*) c FROM dose_logs WHERE date BETWEEN ? AND ? GROUP BY date, status',
    [start, end],
  );
  for (const r of doseRows) {
    const c = ensure(r.date);
    c.totalDoses += r.c;
    if (r.status === 'taken') c.takenDoses += r.c;
  }
  for (const c of map.values()) {
    c.compliancePct = c.totalDoses > 0 ? Math.round((c.takenDoses / c.totalDoses) * 100) : 0;
  }

  const evRows = await db.getAllAsync<{ date: string; c: number }>(
    'SELECT date, COUNT(*) c FROM relapse_events WHERE date BETWEEN ? AND ? GROUP BY date',
    [start, end],
  );
  for (const r of evRows) ensure(r.date).eventCount = r.c;

  const jRows = await db.getAllAsync<{ date: string }>(
    'SELECT date FROM journal_entries WHERE date BETWEEN ? AND ?',
    [start, end],
  );
  for (const r of jRows) ensure(r.date).hasJournal = true;

  const anchorRows = await db.getAllAsync<{ date: string; t0_timestamp: number | null; water_ml: number }>(
    'SELECT date, t0_timestamp, water_ml FROM daily_anchors WHERE date BETWEEN ? AND ?',
    [start, end],
  );
  for (const r of anchorRows) {
    const c = ensure(r.date);
    if (r.t0_timestamp) c.started = true;
    if (r.water_ml > 0) c.hasWater = true;
  }

  return map;
}

/** A day-detail dose row. It is a full `ScheduledDose` — carrying `logId` above
 *  all — because the calendar now opens the dose sheet against it: without the
 *  row id nothing in the app could correct a past dose, ever (round 3, A4). */
export type DayDetailDose = ScheduledDose & { loggedTime: number | null };

export interface DayDetail {
  date: string;
  doses: DayDetailDose[];
  takenDoses: number;
  totalDoses: number;
  missedDoses: number;
  compliancePct: number;
  journal: JournalEntry | null;
  events: RelapseEvent[];
}

// Aggregates everything logged on a single day — pills, journal, and events —
// for the History day-detail view.
export async function getDayDetail(date: string): Promise<DayDetail> {
  const summary = await getDaySummary(date);
  const doseLogs = await getDoseLogs(date);
  const journal = await getJournalEntry(date);
  const db = await getDb();
  const events = await db.getAllAsync<RelapseEvent>(
    'SELECT * FROM relapse_events WHERE date = ? ORDER BY created_at DESC',
    [date]
  );
  return {
    date,
    // Status is read straight from the row: on a past day the clock has nothing
    // left to say about it, so none of the live 'upcoming' → 'due' derivation
    // that getTodaySchedule does applies here.
    doses: doseLogs.map((d) => ({
      id: d.id,
      supplement_id: d.supplement_id,
      supplementName: d.supplement_name,
      form: d.supplement_form,
      scheduledTime: new Date(d.scheduled_time),
      earliestTime: new Date(d.scheduled_time - d.tolerance_window * 60 * 1000),
      latestTime: new Date(d.scheduled_time + d.tolerance_window * 60 * 1000),
      status: d.status,
      toleranceMinutes: d.tolerance_window,
      doseAmount: d.dose_amount,
      withFood: d.with_food === 1,
      notes: d.supplement_notes ?? '',
      logId: d.id,
      skipReason: d.skip_reason ?? undefined,
      loggedTime: d.logged_time,
    })),
    takenDoses: summary.takenDoses,
    totalDoses: summary.totalDoses,
    missedDoses: summary.missedDoses,
    compliancePct: summary.compliancePct,
    journal,
    events,
  };
}

export async function getWeekSummary(): Promise<{ date: string; compliancePct: number }[]> {
  const days: { date: string; compliancePct: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = localDateStr(d);
    const summary = await getDaySummary(dateStr);
    days.push({ date: dateStr, compliancePct: summary.compliancePct });
  }
  return days;
}

export async function getWaterProgress(date: string = todayStr()): Promise<{ waterMl: number; goalMl: number }> {
  const anchor = await getAnchor(date);
  return { waterMl: anchor?.water_ml ?? 0, goalMl: 2500 };
}

// ── Streak ────────────────────────────────────────────────────────────────────

export async function getStreak(date: string = todayStr()): Promise<number> {
  const db = await getDb();
  const todayDate = new Date(date + 'T00:00:00');
  const startDate = new Date(todayDate);
  startDate.setDate(startDate.getDate() - 60);
  const start = localDateStr(startDate);

  const rows = await db.getAllAsync<{ date: string; total: number; taken: number; upcoming: number }>(
    `SELECT date, COUNT(*) as total,
            SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken,
            SUM(CASE WHEN status = 'upcoming' THEN 1 ELSE 0 END) as upcoming
     FROM dose_logs
     WHERE date >= ? AND date <= ?
     GROUP BY date
     ORDER BY date DESC`,
    [start, date]
  );

  let streak = 0;
  for (const row of rows) {
    if (row.total > 0 && row.total === row.taken) {
      streak++;
      continue;
    }
    // Today is still in progress. Its doses are not missed, they simply have
    // not come round yet, so it is not a broken day — skip it without counting
    // and keep walking backwards. Without this the streak read 0 for most of
    // every day, however perfect the preceding weeks had been.
    if (row.date === date && row.upcoming > 0) continue;
    break;
  }
  return streak;
}

// ── Patient Notifications ──────────────────────────────────────────────────────

export async function getPatientName(): Promise<string> {
  const db = await getDb();
  const profile = await db.getFirstAsync<{ name: string }>(
    'SELECT name FROM user_profile WHERE id = 1'
  );
  return profile?.name ?? 'there';
}

export async function getAverageStartTime(): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ avg_time: string | null }>(
    `SELECT strftime('%H:%M', AVG(strftime('%s', t0_timestamp))) as avg_time
     FROM (
       SELECT t0_timestamp FROM daily_anchors
       WHERE t0_timestamp IS NOT NULL
       ORDER BY date DESC
       LIMIT 14
     )`
  );
  return row?.avg_time ?? null;
}

// ── First Meal Time ──────────────────────────────────────────────────────────
export async function setFirstMealTime(date: string, time: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE daily_anchors SET first_meal_time = ? WHERE date = ?',
    [time, date]
  );
}

export async function getFirstMealTime(date: string = todayStr()): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ first_meal_time: string | null }>(
    'SELECT first_meal_time FROM daily_anchors WHERE date = ?',
    [date]
  );
  return row?.first_meal_time ?? null;
}

// ── Exercise ──────────────────────────────────────────────────────────────────

export async function logExercise(durationMinutes: number = 30, type: string = 'walk', date: string = todayStr(), intensity: string = 'moderate'): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO exercise_logs (date, duration_minutes, type, intensity, logged_at) VALUES (?, ?, ?, ?, ?)',
    [date, durationMinutes, type, intensity, Date.now()]
  );
  await enqueueAction('exercise_logged', { minutes: durationMinutes, type, date });
}

export async function getTodayExercise(date: string = todayStr()): Promise<{ totalMinutes: number; logged: boolean; type: string; intensity: string }> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ duration_minutes: number; type: string; intensity: string }>(
    'SELECT duration_minutes, type, intensity FROM exercise_logs WHERE date = ? ORDER BY logged_at DESC',
    [date]
  );
  const totalMinutes = rows.reduce((sum, r) => sum + r.duration_minutes, 0);
  const last = rows[0];
  return { totalMinutes, logged: totalMinutes > 0, type: last?.type ?? 'walk', intensity: last?.intensity ?? 'moderate' };
}

// ── Journal ────────────────────────────────────────────────────────────────────

export async function getJournalEntry(date: string): Promise<JournalEntry | null> {
  const db = await getDb();
  return db.getFirstAsync<JournalEntry>(
    'SELECT * FROM journal_entries WHERE date = ?',
    [date]
  );
}

export async function upsertJournalEntry(entry: {
  date: string; mood: string; note: string; dietary_note?: string;
  compliance_pct: number; doses_taken: number; doses_total: number;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO journal_entries (date, mood, note, dietary_note, compliance_pct, doses_taken, doses_total)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       mood = excluded.mood,
       note = excluded.note,
       dietary_note = COALESCE(excluded.dietary_note, dietary_note),
       compliance_pct = excluded.compliance_pct,
       doses_taken = excluded.doses_taken,
       doses_total = excluded.doses_total,
       updated_at = datetime('now')`,
    [entry.date, entry.mood, entry.note, entry.dietary_note ?? '', entry.compliance_pct, entry.doses_taken, entry.doses_total]
  );
}

export async function getRecentJournalEntries(limit: number): Promise<JournalEntry[]> {
  const db = await getDb();
  return db.getAllAsync<JournalEntry>(
    'SELECT * FROM journal_entries ORDER BY date DESC LIMIT ?',
    [limit]
  );
}

export async function getLatestJournalEntry(): Promise<JournalEntry | null> {
  const db = await getDb();
  return db.getFirstAsync<JournalEntry>('SELECT * FROM journal_entries ORDER BY date DESC LIMIT 1');
}

export async function getSemanticJournalSummary(): Promise<string> {
  const db = await getDb();
  const entries = await db.getAllAsync<{ mood: string; date: string; compliance_pct: number }>(
    'SELECT mood, date, compliance_pct FROM journal_entries ORDER BY date DESC LIMIT 30'
  );
  if (entries.length === 0) return 'No journal entries yet.';

  const moodCounts: Record<string, number> = {};
  let weightedTotal = 0;
  const recentCutoff = new Date();
  recentCutoff.setDate(recentCutoff.getDate() - 8);

  for (const e of entries) {
    const entryDate = new Date(e.date + 'T00:00:00');
    const weight = entryDate >= recentCutoff ? 3 : 1;
    moodCounts[e.mood] = (moodCounts[e.mood] ?? 0) + weight;
    weightedTotal += weight;
  }

  const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
  const streak = await getStreak();
  const avgCompliance = Math.round(
    entries.reduce((sum, e) => sum + e.compliance_pct, 0) / entries.length
  );

  return `Mostly feeling ${topMood} lately. ${streak} day protocol streak. ${avgCompliance}% average compliance.`;
}

// ── Relapse Events ────────────────────────────────────────────────────────────

export async function logRelapseEvent(event: {
  date: string; type: string; cortisone_dose_mg?: number; notes: string; severity?: number;
  pain_type?: string; lasted_24h?: number; has_fever?: number;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO relapse_events (date, type, cortisone_dose_mg, notes, severity, pain_type, lasted_24h, has_fever)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [event.date, event.type, event.cortisone_dose_mg ?? null, event.notes, event.severity ?? null,
     event.pain_type ?? null, event.lasted_24h ?? null, event.has_fever ?? null]
  );
}

export async function getRelapseEvents(limit?: number): Promise<RelapseEvent[]> {
  const db = await getDb();
  return db.getAllAsync<RelapseEvent>(
    'SELECT * FROM relapse_events ORDER BY date DESC LIMIT COALESCE(?, 50)',
    [limit ?? null]
  );
}

// ── Sun Exposure ─────────────────────────────────────────────────────────────
// Adds to the day's total. The previous version wrote `minutes = excluded.minutes`,
// which REPLACED the day with the increment: logging +10 then +20 stored 20 while
// the screen showed 30, and the day collapsed to the last tap on reload.
export async function logSunExposure(minutes: number, notes: string = '', uvIndex?: string): Promise<void> {
  const db = await getDb();
  const date = todayStr();
  await db.runAsync(
    `INSERT INTO sun_log (date, minutes, uv_index, notes)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       minutes = sun_log.minutes + excluded.minutes,
       uv_index = COALESCE(excluded.uv_index, sun_log.uv_index),
       notes = CASE WHEN excluded.notes = '' THEN sun_log.notes ELSE excluded.notes END`,
    [date, minutes, uvIndex ?? null, notes]
  );
}

// Sets the day's total outright, for correcting a mis-tap rather than adding to it.
export async function setSunExposure(minutes: number, notes: string = ''): Promise<void> {
  const db = await getDb();
  const date = todayStr();
  await db.runAsync(
    `INSERT INTO sun_log (date, minutes, uv_index, notes)
     VALUES (?, ?, NULL, ?)
     ON CONFLICT(date) DO UPDATE SET minutes = excluded.minutes, notes = excluded.notes`,
    [date, Math.max(0, Math.round(minutes)), notes]
  );
}

export async function getTodaySunLog(): Promise<{ minutes: number; notes: string } | null> {
  const db = await getDb();
  return db.getFirstAsync<{ minutes: number; notes: string }>(
    'SELECT minutes, notes FROM sun_log WHERE date = ?',
    [todayStr()]
  );
}

// ── Blood Test Reminders ─────────────────────────────────────────────────────
export async function getLastBloodTestDate(): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ last_test_date: string | null }>(
    'SELECT last_test_date FROM blood_test_reminders WHERE id = 1'
  );
  return row?.last_test_date ?? null;
}

export async function setLastBloodTestDate(date: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO blood_test_reminders (id, last_test_date, next_reminder_date)
     VALUES (1, ?, date(?, '+' || interval_days || ' days'))
     ON CONFLICT(id) DO UPDATE SET last_test_date = excluded.last_test_date,
       next_reminder_date = date(excluded.last_test_date, '+' || interval_days || ' days')`,
    [date, date]
  );
}

// ── Supplement Stock ──────────────────────────────────────────────────────────

export async function decrementQuantity(supplementId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE supplements SET quantity_on_hand = quantity_on_hand - 1 WHERE id = ? AND quantity_on_hand > 0",
    [supplementId]
  );
}

/** The other half of decrementQuantity: a dose corrected away from 'taken' puts
 *  its pill back. NULL means the user never told us a count, so leave it NULL
 *  rather than inventing a bottle with one pill in it. */
export async function incrementQuantity(supplementId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE supplements SET quantity_on_hand = quantity_on_hand + 1 WHERE id = ? AND quantity_on_hand IS NOT NULL',
    [supplementId]
  );
}

export async function getSupplementsLowStock(): Promise<Supplement[]> {
  const db = await getDb();
  return db.getAllAsync<Supplement>(
    "SELECT * FROM supplements WHERE quantity_on_hand <= 7 AND quantity_on_hand IS NOT NULL AND quantity_on_hand > 0"
  );
}
export async function updateSupplementStock(supplementId: string, stockDays: number | null): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE supplements SET stock_days = ? WHERE id = ?',
    [stockDays, supplementId]
  );
}

export async function getLowStockSupplements(): Promise<{ name: string; stock_days: number }[]> {
  const db = await getDb();
  return db.getAllAsync<{ name: string; stock_days: number }>(
    "SELECT name, stock_days FROM supplements WHERE stock_days IS NOT NULL AND stock_days <= 7"
  );
}

export async function getAllSupplements(): Promise<{ id: string; name: string; stock_days: number | null }[]> {
  const db = await getDb();
  return db.getAllAsync<{ id: string; name: string; stock_days: number | null }>(
    'SELECT id, name, stock_days FROM supplements ORDER BY name'
  );
}

export async function getSupplementsWithRules(): Promise<{
  id: string; name: string; form: string;
  dose_amount: string; dose_unit: string; offset_minutes: number;
  with_food: number; tolerance_window: number; rule_id: number | null;
}[]> {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT s.id, s.name, s.form,
       COALESCE(sr.dose_amount, '') as dose_amount,
       COALESCE(sr.dose_unit, '') as dose_unit,
       COALESCE(sr.offset_minutes, 0) as offset_minutes,
       COALESCE(sr.with_food, 0) as with_food,
       COALESCE(sr.tolerance_window, 30) as tolerance_window,
       sr.id as rule_id
     FROM supplements s
     LEFT JOIN schedule_rules sr ON sr.supplement_id = s.id
     ORDER BY s.name`
  );
}

/**
 * Materialise one dose row for a rule added after "Start My Day".
 *
 * Only `startDay()` called `createDoseLogs`, so a supplement added mid-day had a
 * rule but no `dose_logs` row and never appeared in today's protocol — it showed
 * up for the first time the next morning.
 *
 * Re-running `createDoseLogs` for every rule would have been the smaller diff,
 * but it deletes only `status = 'upcoming'` rows and then re-inserts a row for
 * *every* rule: a supplement already taken today keeps its 'taken' row AND gains
 * a fresh 'upcoming' one. One row for the new rule only, no deletes.
 *
 * No-op before the day is started — `startDay()` will pick the rule up itself.
 */
async function createDoseLogForNewRule(
  supplementId: string,
  ruleId: number,
  offsetMinutes: number,
  date: string = todayStr()
): Promise<void> {
  const db = await getDb();
  const anchor = await db.getFirstAsync<{ t0_timestamp: number | null }>(
    'SELECT t0_timestamp FROM daily_anchors WHERE date = ?',
    [date]
  );
  if (!anchor?.t0_timestamp) return;

  const scheduledTime = anchor.t0_timestamp + offsetMinutes * 60 * 1000;

  // A dose added after its own t0 + offset has passed is created 'due', not
  // 'missed' and not deferred to tomorrow — Cedric's call, 2026-09-13, closing
  // round 1's 2.4. The user added it just now and can still take it late;
  // marking a dose missed that they never had the chance to take is a lie the
  // compliance numbers then carry forever. 'due' also cannot be aged out behind
  // their back: markOverdueDoses() only rewrites 'upcoming'.
  const status = scheduledTime <= Date.now() ? 'due' : 'upcoming';

  await db.runAsync(
    `INSERT INTO dose_logs (date, supplement_id, rule_id, scheduled_time, status)
     VALUES (?, ?, ?, ?, ?)`,
    [date, supplementId, ruleId, scheduledTime, status]
  );
}

export async function addSupplement(data: {
  name: string; form: string;
  dose_amount: string; dose_unit: string;
  offset_minutes: number; with_food: boolean; tolerance_window: number;
}): Promise<void> {
  const db = await getDb();
  const id = data.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now();
  await db.runAsync(
    'INSERT INTO supplements (id, name, form) VALUES (?, ?, ?)',
    [id, data.name.trim(), data.form]
  );
  const rule = await db.runAsync(
    `INSERT INTO schedule_rules (supplement_id, dose_amount, dose_unit, offset_minutes, with_food, tolerance_window, anchor_type)
     VALUES (?, ?, ?, ?, ?, ?, 't0')`,
    [id, data.dose_amount, data.dose_unit, data.offset_minutes, data.with_food ? 1 : 0, data.tolerance_window]
  );
  await createDoseLogForNewRule(id, rule.lastInsertRowId, data.offset_minutes);
}

export async function updateSupplementAndRule(data: {
  supplementId: string; ruleId: number;
  name: string; form: string;
  dose_amount: string; dose_unit: string;
  offset_minutes: number; with_food: boolean; tolerance_window: number;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE supplements SET name = ?, form = ? WHERE id = ?', [data.name, data.form, data.supplementId]);
  await db.runAsync(
    `UPDATE schedule_rules SET dose_amount=?, dose_unit=?, offset_minutes=?, with_food=?, tolerance_window=? WHERE id=?`,
    [data.dose_amount, data.dose_unit, data.offset_minutes, data.with_food ? 1 : 0, data.tolerance_window, data.ruleId]
  );
}

export async function deleteSupplement(supplementId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM dose_logs WHERE supplement_id = ?', [supplementId]);
  await db.runAsync('DELETE FROM schedule_rules WHERE supplement_id = ?', [supplementId]);
  await db.runAsync('DELETE FROM supplements WHERE id = ?', [supplementId]);
}

// ── Protocol Adherence Score ──────────────────────────────────────────────────
export async function getWeightedAdherenceScore(days: number = 14): Promise<number> {
  const db = await getDb();
  // Bounded on both ends and anchored to the app's own clock (todayStr, local),
  // not SQLite's date('now') — that reads the real device clock regardless of
  // what the rest of the app believes "today" is, and had no upper bound at
  // all, so any future-dated row (clock skew, a synced write) inflated the
  // "trailing N days" score forever instead of aging out of it.
  const ref = todayStr();
  const rows = await db.getAllAsync<{ supplement_id: string; status: string; row_num: number; total_rows: number }>(
    `SELECT dl.supplement_id, dl.status, ROW_NUMBER() OVER (ORDER BY dl.date DESC) as row_num, COUNT(*) OVER () as total_rows
     FROM dose_logs dl
     WHERE dl.date >= date(?, '-' || ? || ' days') AND dl.date <= ?
     ORDER BY dl.date DESC, dl.scheduled_time ASC`,
    [ref, days, ref]
  );
  if (rows.length === 0) return 0;

  let weightedSum = 0;
  let maxScore = 0;
  const totalRows = rows[0]?.total_rows ?? 1;

  for (const r of rows) {
    const recencyWeight = r.row_num <= 7 ? 2 : 1;
    const supplementWeight = ['vit_d3', 'vit_k2', 'mag_citrate'].includes(r.supplement_id) ? 1.5 : 1;
    const w = recencyWeight * supplementWeight;
    maxScore += w;
    if (r.status === 'taken') weightedSum += w;
  }

  return Math.round((weightedSum / maxScore) * 100);
}

// ── Meal Log ──────────────────────────────────────────────────────────────────

export async function logMeal(date: string, meal_type: string, time: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO meal_log (date, meal_type, time) VALUES (?, ?, ?)',
    [date, meal_type, time]
  );
}

export async function getTodayMeals(date: string): Promise<{ id: number; meal_type: string; time: string }[]> {
  const db = await getDb();
  return db.getAllAsync<{ id: number; meal_type: string; time: string }>(
    'SELECT id, meal_type, time FROM meal_log WHERE date = ? ORDER BY logged_at ASC',
    [date]
  );
}

// ── Supplement Form ───────────────────────────────────────────────────────────

export async function getSupplementForms(): Promise<{ id: string; name: string; form: string }[]> {
  const db = await getDb();
  return db.getAllAsync<{ id: string; name: string; form: string }>(
    'SELECT id, name, form FROM supplements ORDER BY name'
  );
}

export async function updateSupplementForm(supplementId: string, form: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE supplements SET form = ? WHERE id = ?', [form, supplementId]);
}

// ── Medical Events ─────────────────────────────────────────────────────────────

function rowToMedicalEvent(row: Record<string, unknown>): MedicalEvent {
  return {
    id: row.id as number,
    type: row.type as MedicalEvent['type'],
    title: row.title as string,
    scheduled_date: row.scheduled_date as string,
    scheduled_time: row.scheduled_time as string | undefined,
    location: row.location as string | undefined,
    notes: row.notes as string | undefined,
    reminder_7d: !!(row.reminder_7d as number),
    reminder_3d: !!(row.reminder_3d as number),
    reminder_1d: !!(row.reminder_1d as number),
    reminder_2h: !!(row.reminder_2h as number),
    completed: !!(row.completed as number),
    created_at: row.created_at as string,
  };
}

export async function getNextMedicalEvent(): Promise<MedicalEvent | null> {
  const db = await getDb();
  const today = todayStr();
  const in60 = localDateStr(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM medical_events
     WHERE completed = 0 AND scheduled_date >= ? AND scheduled_date <= ?
     ORDER BY scheduled_date ASC, scheduled_time ASC LIMIT 1`,
    [today, in60]
  );
  return row ? rowToMedicalEvent(row) : null;
}

export async function getAllMedicalEvents(): Promise<MedicalEvent[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM medical_events WHERE completed = 0 ORDER BY scheduled_date ASC, scheduled_time ASC`
  );
  return rows.map(rowToMedicalEvent);
}

export async function addMedicalEvent(event: Omit<MedicalEvent, 'id' | 'created_at'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO medical_events
       (type, title, scheduled_date, scheduled_time, location, notes,
        reminder_7d, reminder_3d, reminder_1d, reminder_2h, completed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.type, event.title, event.scheduled_date,
      event.scheduled_time ?? null, event.location ?? null, event.notes ?? null,
      event.reminder_7d ? 1 : 0, event.reminder_3d ? 1 : 0,
      event.reminder_1d ? 1 : 0, event.reminder_2h ? 1 : 0,
      event.completed ? 1 : 0,
    ]
  );
}

export async function completeMedicalEvent(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE medical_events SET completed = 1 WHERE id = ?', [id]);
}

// ── Calcium Logs ─────────────────────────────────────────────────────────────

export async function saveCalciumLog(data: {
  testStartDate: string; day: number; calciumMg: number; notes: string;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO calcium_logs (test_start_date, day, calcium_mg, notes) VALUES (?, ?, ?, ?)',
    [data.testStartDate, data.day, data.calciumMg, data.notes]
  );
}

export async function getCalciumLogs(): Promise<{ test_start_date: string; day: number; calcium_mg: number; notes: string }[]> {
  const db = await getDb();
  return db.getAllAsync<{ test_start_date: string; day: number; calcium_mg: number; notes: string }>(
    'SELECT * FROM calcium_logs ORDER BY test_start_date DESC, day ASC'
  );
}


// ── Misc Flags ───────────────────────────────────────────────────────────────

export async function getMiscFlag(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM misc_flags WHERE key = ?', [key]
  );
  return row?.value ?? null;
}

export async function setMiscFlag(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO misc_flags (key, value) VALUES (?, ?)', [key, value]
  );
}

// ── Lab Results ──────────────────────────────────────────────────────────────

export async function getLatestLabResult(): Promise<{ vit_d_ngml: number | null; calcium_serum_mgdl: number | null } | null> {
  const db = await getDb();
  return db.getFirstAsync<{ vit_d_ngml: number | null; calcium_serum_mgdl: number | null }>(
    'SELECT vit_d_ngml, calcium_serum_mgdl FROM lab_results ORDER BY date DESC LIMIT 1'
  );
}

// ── Data Export ─────────────────────────────────────────────────────────────
export async function exportAllData(): Promise<Record<string, any>> {
  const db = await getDb();
  
  const tables = [
    'user_profile',
    'supplements', 
    'schedule_rules',
    'supplement_conflicts',
    'daily_anchors',
    'dose_logs',
    'water_logs',
    'exercise_logs',
    'dietary_restrictions',
    'awareness_dates',
    'journal_entries',
    'relapse_events',
    'mri_scans',
    'lab_results',
    'contraindication_rules',
    'patient_medications',
    'sun_log',
    'blood_test_reminders',
    'meal_log',
    'care_surveys',
    'news_cache',
    'feedback',
    'medical_events',
    'calcium_logs',
    'sleep_checkins',
    'action_queue',
    'misc_flags',
    'family_members'
  ];
  
  const result: Record<string, any> = {};
  
  for (const table of tables) {
    try {
      const rows = await db.getAllAsync(`SELECT * FROM ${table}`);
      result[table] = rows;
    } catch (error) {
      console.warn(`Could not export table ${table}:`, error);
      result[table] = [];
    }
  }
  
  return result;
}

export async function exportDataToJson(): Promise<string> {
  const data = await exportAllData();
  return JSON.stringify(data, null, 2);
}

// ── Protocol Recommendations ──────────────────────────────────────────────


