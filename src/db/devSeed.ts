import { getDb } from './schema';
import { localDateStr, addSupplement } from './queries';

// DEVELOPMENT ONLY — backfills a plausible protocol history so a screen with
// charts, streaks and history has something to draw. Every call site is behind
// `__DEV__`, so this cannot reach a release build.
//
// What it will NOT touch: user_profile, supplements, schedule_rules. Your own
// protocol configuration is the input to this, never its output — the dose rows
// it writes follow the schedule rules already on the device, so the history it
// creates is a history of YOUR protocol, not an invented one.

/**
 * Create a starter protocol so there is something for the history to hang off.
 * These are PLACEHOLDERS, not a recommendation: the amounts are what an
 * ordinary label prints, and the D3 row is left empty on purpose — the dose is
 * the user's, and since 2026-09-14 nothing on the device derives one.
 * Everything here is editable in Settings -> Manage supplements, and the whole
 * function is unreachable outside __DEV__.
 */
export async function stageDemoSupplements(): Promise<string[]> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM schedule_rules');
  if (existing && existing.n > 0) return [];


  const rows: Array<{ name: string; form: string; dose_amount: string; dose_unit: string; offset_minutes: number; with_food: boolean; tolerance_window: number }> = [
    { name: 'Vitamin D3',           form: 'capsule', dose_amount: '',     dose_unit: 'IU',  offset_minutes: 0,   with_food: true,  tolerance_window: 30 },
    { name: 'Vitamin K2 MK-7',      form: 'capsule', dose_amount: '200',  dose_unit: 'mcg', offset_minutes: 0,   with_food: true,  tolerance_window: 30 },
    { name: 'Magnesium Glycinate',  form: 'capsule', dose_amount: '400',  dose_unit: 'mg',  offset_minutes: 240, with_food: false, tolerance_window: 60 },
    { name: 'Omega-3',              form: 'capsule', dose_amount: '2000', dose_unit: 'mg',  offset_minutes: 240, with_food: true,  tolerance_window: 60 },
  ];

  const made: string[] = [];
  for (const r of rows) {
    // Never invent the dose the user owns: the D3 row is created with an
    // empty amount for them to fill in, loudly, rather than with a number this
    // code made up.
    await addSupplement(r);
    made.push(`${r.name} ${r.dose_amount || '(SET YOUR DOSE)'} ${r.dose_unit}`);
  }
  return made;
}

/** Deterministic PRNG, so re-running produces the identical history. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const MOODS = ['😄', '🙂', '😐', '😔', '😞'];

export type SeedMode = 'append' | 'replace';

export interface SeedResult {
  days: number;
  from: string;
  to: string;
  doseRows: number;
  dosesTaken: number;
  journalRows: number;
  waterRows: number;
  labRows: number;
  mriRows: number;
  eventRows: number;
  skippedExistingDays: number;
  stagedSupplements: string[];
}

/**
 * Write `days` days of history ending yesterday. Today is deliberately left
 * alone so the live "Start My Day" flow still behaves normally.
 */
export async function seedSimulatedHistory(
  days: number = 60,
  mode: SeedMode = 'append',
): Promise<SeedResult> {
  const db = await getDb();

  const rules = await db.getAllAsync<{
    id: number;
    supplement_id: string;
    offset_minutes: number;
    tolerance_window: number;
  }>('SELECT id, supplement_id, offset_minutes, tolerance_window FROM schedule_rules ORDER BY display_order, id');

  let staged: string[] = [];
  if (rules.length === 0) {
    staged = await stageDemoSupplements();
    rules.push(...await db.getAllAsync<{
      id: number; supplement_id: string; offset_minutes: number; tolerance_window: number;
    }>('SELECT id, supplement_id, offset_minutes, tolerance_window FROM schedule_rules ORDER BY display_order, id'));
    if (rules.length === 0) {
      throw new Error('Could not create a starter protocol. Add supplements in Settings → Manage supplements, then load the history.');
    }
  }

  const dates: string[] = [];
  for (let i = days; i >= 1; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(localDateStr(d));
  }
  const from = dates[0];
  const to = dates[dates.length - 1];

  if (mode === 'replace') {
    for (const table of ['daily_anchors', 'dose_logs', 'water_logs', 'sun_log', 'journal_entries', 'relapse_events', 'exercise_logs']) {
      await db.runAsync(`DELETE FROM ${table} WHERE date >= ? AND date <= ?`, [from, to]);
    }
    await db.runAsync('DELETE FROM lab_results WHERE date >= ? AND date <= ?', [from, to]);
    await db.runAsync('DELETE FROM mri_scans WHERE date >= ? AND date <= ?', [from, to]);
  }

  const existing = await db.getAllAsync<{ date: string }>(
    'SELECT DISTINCT date FROM daily_anchors WHERE date >= ? AND date <= ?',
    [from, to],
  );
  const taken = new Set(existing.map((r) => r.date));

  const rand = rng(20260911);
  const result: SeedResult = {
    days: 0, from, to, doseRows: 0, dosesTaken: 0, journalRows: 0,
    waterRows: 0, labRows: 0, mriRows: 0, eventRows: 0,
    skippedExistingDays: 0, stagedSupplements: staged,
  };

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    if (taken.has(date)) { result.skippedExistingDays += 1; continue; }

    const roll = rand();
    // A real chart is not a straight line: some days are missed entirely, some
    // are started and abandoned.
    const shape = roll < 0.08 ? 'skipped' : roll < 0.22 ? 'partial' : 'full';
    if (shape === 'skipped') continue;

    result.days += 1;

    // T=0 lands somewhere around the morning, not on the same minute every day.
    const t0 = new Date(`${date}T07:30:00`);
    t0.setMinutes(t0.getMinutes() + Math.floor(rand() * 40) - 20);
    const t0Ms = t0.getTime();

    const waterMl = shape === 'partial' ? 500 + Math.floor(rand() * 4) * 250 : 1750 + Math.floor(rand() * 4) * 250;
    await db.runAsync(
      'INSERT OR REPLACE INTO daily_anchors (date, t0_timestamp, water_ml) VALUES (?, ?, ?)',
      [date, t0Ms, waterMl],
    );
    for (let ml = 0; ml < waterMl; ml += 250) {
      await db.runAsync(
        'INSERT INTO water_logs (date, amount_ml, logged_at) VALUES (?, ?, ?)',
        [date, 250, new Date(t0Ms + ml * 60).toISOString()],
      );
      result.waterRows += 1;
    }

    if (shape === 'full' && rand() > 0.25) {
      await db.runAsync(
        'INSERT INTO sun_log (date, minutes, uv_index, notes, logged_at) VALUES (?, ?, ?, ?, ?)',
        [date, 15 + Math.floor(rand() * 4) * 5, null, '', new Date(t0Ms + 5 * 3600_000).toISOString()],
      );
    }

    if (shape === 'full' && rand() > 0.6) {
      await db.runAsync(
        'INSERT INTO exercise_logs (date, duration_minutes, type, logged_at) VALUES (?, ?, ?, ?)',
        [date, 20 + Math.floor(rand() * 5) * 10, 'walk', new Date(t0Ms + 8 * 3600_000).toISOString()],
      );
    }

    let dayTaken = 0;
    for (const rule of rules) {
      const scheduled = t0Ms + rule.offset_minutes * 60_000;
      // Partial days drop the later doses; full days occasionally miss one.
      const missed = shape === 'partial' ? rule.offset_minutes > 0 : rand() < 0.07;
      // Some of the untaken doses are deliberate skips, so seeded data covers
      // both statuses. Either way the row is not 'taken', so every compliance
      // number the seed produces is unchanged.
      const status = missed ? (rand() < 0.4 ? 'skipped' : 'missed') : 'taken';
      const loggedTime = missed ? null : scheduled + Math.floor(rand() * rule.tolerance_window) * 60_000;
      await db.runAsync(
        `INSERT INTO dose_logs (date, supplement_id, rule_id, scheduled_time, logged_time, status, missed_alerted)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [date, rule.supplement_id, rule.id, scheduled, loggedTime, status],
      );
      result.doseRows += 1;
      if (!missed) { dayTaken += 1; result.dosesTaken += 1; }
    }

    if (shape === 'full') {
      const mood = MOODS[Math.floor(rand() * MOODS.length)];
      const pct = rules.length > 0 ? Math.round((dayTaken / rules.length) * 100) : 0;
      const stamp = new Date(t0Ms + 14 * 3600_000).toISOString().replace('T', ' ').slice(0, 19);
      await db.runAsync(
        `INSERT INTO journal_entries (date, mood, note, compliance_pct, doses_taken, doses_total, created_at, updated_at, dietary_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [date, mood, '', pct, dayTaken, rules.length, stamp, stamp, ''],
      );
      result.journalRows += 1;
    }

    // A handful of medical events across the window.
    if (rand() < 0.06) {
      const types = ['symptom', 'pain', 'relapse', 'cortisone'];
      const type = types[Math.floor(rand() * types.length)];
      await db.runAsync(
        `INSERT INTO relapse_events (date, type, cortisone_dose_mg, notes, severity, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [date, type, type === 'cortisone' ? 500 : null, '', 1 + Math.floor(rand() * 4), new Date(t0Ms).toISOString()],
      );
      result.eventRows += 1;
    }
  }

  // Lab panels bracketing the window. Urinary calcium climbs across them —
  // that is the number this protocol is monitored on.
  const labPoints: Array<[string, number, number, number, number, string]> = [
    [dates[0], 32, 62, 9.2, 118, 'None'],
    [dates[Math.floor(dates.length / 2)], 148, 24, 9.6, 214, 'Slight'],
    [dates[dates.length - 1], 192, 13, 9.9, 268, 'Moderate'],
  ];
  for (const [date, vitD, pth, caS, caU, sulk] of labPoints) {
    const dup = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM lab_results WHERE date = ?', [date]);
    if (dup && dup.n > 0) continue;
    await db.runAsync(
      `INSERT INTO lab_results (date, vit_d_ngml, pth_pgml, calcium_serum_mgdl, calcium_urine_mg_g_cr, creatinine_mgdl, nfl_pgl, sulkowitch, notes, created_at)
       VALUES (?, ?, ?, ?, ?, 0.9, NULL, ?, '', ?)`,
      [date, vitD, pth, caS, caU, sulk, new Date().toISOString()],
    );
    result.labRows += 1;
  }

  for (const [date, lesions] of [[dates[0], 'None'], [dates[dates.length - 1], 'None']] as Array<[string, string]>) {
    const dup = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM mri_scans WHERE date = ?', [date]);
    if (dup && dup.n > 0) continue;
    await db.runAsync(
      `INSERT INTO mri_scans (date, facility, scan_type, contrast, new_lesions, enhancing_lesions, overall_assessment, notes, created_at)
       VALUES (?, '', 'Brain', 0, ?, NULL, 'Stable', '', ?)`,
      [date, lesions, new Date().toISOString()],
    );
    result.mriRows += 1;
  }

  return result;
}

/** Remove everything seedSimulatedHistory wrote in the window, leaving today alone. */
export async function clearSeededHistory(days: number = 60): Promise<void> {
  const db = await getDb();
  const start = new Date(); start.setDate(start.getDate() - days);
  const end = new Date(); end.setDate(end.getDate() - 1);
  const from = localDateStr(start);
  const to = localDateStr(end);
  for (const table of ['daily_anchors', 'dose_logs', 'water_logs', 'sun_log', 'journal_entries', 'relapse_events', 'exercise_logs', 'lab_results', 'mri_scans']) {
    await db.runAsync(`DELETE FROM ${table} WHERE date >= ? AND date <= ?`, [from, to]);
  }
}
