import { getDb } from './schema';
import type { UserProfile, DailyAnchor, DoseLog, ScheduleRule, Supplement, DaySummary, JournalEntry } from '../types';

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

export async function getScheduleRules(): Promise<(ScheduleRule & { supplement_name: string; supplement_form: string })[]> {
  const db = await getDb();
  return db.getAllAsync<ScheduleRule & { supplement_name: string; supplement_form: string }>(
    `SELECT sr.*, s.name as supplement_name, s.form as supplement_form
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

export async function getDoseLogs(date: string = todayStr()): Promise<(DoseLog & { supplement_name: string; supplement_form: string; supplement_notes: string; dose_amount: string; with_food: number; tolerance_window: number })[]> {
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
  await db.runAsync(
    "UPDATE dose_logs SET status = 'taken', logged_time = ? WHERE id = ?",
    [Date.now(), logId]
  );
}

export async function skipDose(logId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE dose_logs SET status = 'missed', logged_time = ? WHERE id = ?",
    [Date.now(), logId]
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

// ── Exercise ──────────────────────────────────────────────────────────────────

export async function logExercise(durationMinutes: number = 30, type: string = 'walk', date: string = todayStr()): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO exercise_logs (date, duration_minutes, type, logged_at) VALUES (?, ?, ?, ?)',
    [date, durationMinutes, type, Date.now()]
  );
}

export async function getTodayExercise(date: string = todayStr()): Promise<{ totalMinutes: number; logged: boolean }> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(duration_minutes), 0) as total FROM exercise_logs WHERE date = ?',
    [date]
  );
  const totalMinutes = row?.total ?? 0;
  return { totalMinutes, logged: totalMinutes > 0 };
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

// ── Doctor Profile ────────────────────────────────────────────────────────
export interface DoctorProfile {
  id: number;
  name: string | null;
  clinic: string | null;
  email: string | null;
  phone: string | null;
}

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


