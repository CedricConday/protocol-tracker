import { getDb } from './schema';
import type { UserProfile, DailyAnchor, DoseLog, ScheduleRule, Supplement, DaySummary, JournalEntry, RelapseEvent } from '../types';

export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

// ── User Profile ─────────────────────────────────────────────────────────────

export async function getProfile(): Promise<UserProfile | null> {
  const db = await getDb();
  return db.getFirstAsync<UserProfile>('SELECT * FROM user_profile WHERE id = 1');
}

export async function updateProfile(fields: Partial<UserProfile>): Promise<void> {
  const db = await getDb();
  const entries = Object.entries(fields).filter(([k]) => k !== 'id');
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

export async function confirmDose(logId: number): Promise<void> {
  const db = await getDb();
  const log = await db.getFirstAsync<{ supplement_id: string }>('SELECT supplement_id FROM dose_logs WHERE id = ?', [logId]);
  await db.runAsync(
    "UPDATE dose_logs SET status = 'taken', logged_time = ? WHERE id = ?",
    [Date.now(), logId]
  );
  if (log?.supplement_id) {
    await decrementQuantity(log.supplement_id);
  }
}

export async function skipDose(logId: number): Promise<void> {
  const db = await getDb();
  const log = await db.getFirstAsync<{supplement_id: string}>("SELECT supplement_id FROM dose_logs WHERE id = ?", [logId]);
  await db.runAsync(
    "UPDATE dose_logs SET status = 'missed', logged_time = ? WHERE id = ?",
    [Date.now(), logId]
  );
  if (log?.supplement_id) await decrementQuantity(log.supplement_id);
}

export async function skipDoseWithReason(logId: number, reason: string): Promise<void> {
  const db = await getDb();
  const log = await db.getFirstAsync<{supplement_id: string}>("SELECT supplement_id FROM dose_logs WHERE id = ?", [logId]);
  await db.runAsync(
    "UPDATE dose_logs SET status = 'missed', logged_time = ?, skip_reason = ? WHERE id = ?",
    [Date.now(), reason, logId]
  );
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

  const counts = { taken: 0, missed: 0, upcoming: 0, due: 0 };
  for (const row of logs) {
    counts[row.status as keyof typeof counts] = row.count;
  }

  const total = counts.taken + counts.missed + counts.upcoming + counts.due;
  const compliancePct = total > 0 ? Math.round((counts.taken / total) * 100) : 0;

  return {
    totalDoses: total,
    takenDoses: counts.taken,
    missedDoses: counts.missed,
    compliancePct,
    waterMl: anchor?.water_ml ?? 0,
    t0: anchor?.t0_timestamp ? new Date(anchor.t0_timestamp) : null,
  };
}

export async function getWeekSummary(): Promise<{ date: string; compliancePct: number }[]> {
  const days: { date: string; compliancePct: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const summary = await getDaySummary(dateStr);
    days.push({ date: dateStr, compliancePct: summary.compliancePct });
  }
  return days;
}

export async function getMonthSummary(): Promise<{ date: string; compliancePct: number; totalDoses: number }[]> {
  const days: { date: string; compliancePct: number; totalDoses: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const summary = await getDaySummary(dateStr);
    days.push({ date: dateStr, compliancePct: summary.compliancePct, totalDoses: summary.totalDoses });
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
  const start = startDate.toISOString().split('T')[0];

  const rows = await db.getAllAsync<{ date: string; total: number; taken: number }>(
    `SELECT date, COUNT(*) as total,
            SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken
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
    } else {
      break;
    }
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

export async function getHighComplianceDaysCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM (
      SELECT date,
        SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken,
        COUNT(*) as total
      FROM dose_logs
      GROUP BY date
      HAVING taken = total AND total > 0
    )`
  );
  return row?.count ?? 0;
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
  date: string; mood: string; note: string;
  compliance_pct: number; doses_taken: number; doses_total: number;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO journal_entries (date, mood, note, compliance_pct, doses_taken, doses_total)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       mood = excluded.mood,
       note = excluded.note,
       compliance_pct = excluded.compliance_pct,
       doses_taken = excluded.doses_taken,
       doses_total = excluded.doses_total,
       updated_at = datetime('now')`,
    [entry.date, entry.mood, entry.note, entry.compliance_pct, entry.doses_taken, entry.doses_total]
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

// ── Doctor Profile ────────────────────────────────────────────────────────
export interface DoctorProfile {
  id: number;
  name: string | null;
  clinic: string | null;
  email: string | null;
  phone: string | null;
}

// ── Sun Exposure ─────────────────────────────────────────────────────────────
export async function logSunExposure(minutes: number, notes: string = '', uvIndex?: string): Promise<void> {
  const db = await getDb();
  const date = todayStr();
  await db.runAsync(
    `INSERT INTO sun_log (date, minutes, uv_index, notes)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET minutes = excluded.minutes, uv_index = excluded.uv_index, notes = excluded.notes`,
    [date, minutes, uvIndex ?? null, notes]
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
  await db.runAsync(
    `INSERT INTO schedule_rules (supplement_id, dose_amount, dose_unit, offset_minutes, with_food, tolerance_window, anchor_type)
     VALUES (?, ?, ?, ?, ?, ?, 't0')`,
    [id, data.dose_amount, data.dose_unit, data.offset_minutes, data.with_food ? 1 : 0, data.tolerance_window]
  );
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

// ── Doctor Profile ────────────────────────────────────────────────────────
export async function getDoctor(): Promise<DoctorProfile | null> {
  const db = await getDb();
  return db.getFirstAsync<DoctorProfile>('SELECT * FROM doctor_profile WHERE id = 1');
}

export async function updateDoctor(data: { name: string; clinic: string; email: string; phone: string }): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO doctor_profile (id, name, clinic, email, phone) VALUES (1, ?, ?, ?, ?) ' +
    'ON CONFLICT(id) DO UPDATE SET name = excluded.name, clinic = excluded.clinic, ' +
    'email = excluded.email, phone = excluded.phone',
    [data.name, data.clinic, data.email, data.phone]
  );
}



// ── Protocol Adherence Score ──────────────────────────────────────────────────
export async function getWeightedAdherenceScore(days: number = 14): Promise<number> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ supplement_id: string; status: string; row_num: number; total_rows: number }>(
    'SELECT dl.supplement_id, dl.status, ROW_NUMBER() OVER (ORDER BY dl.date DESC) as row_num, COUNT(*) OVER () as total_rows FROM dose_logs dl WHERE dl.date >= date("now", "-" || ? || " days") ORDER BY dl.date DESC, dl.scheduled_time ASC',
    [days]
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
