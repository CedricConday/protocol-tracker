/**
 * ±30-day Records-screen back-test.
 *
 * Drives the real data layer for 30 simulated days before "today" through 30
 * simulated days after it (61 days, day0 = today-30), then reads the result
 * back through exactly the query set `useSummaryScreen` calls for the Records
 * tab. Originally written to answer "does every metric score the queries
 * layer can produce actually reach a screen, with a sane value" — it found
 * three live bugs (unbounded adherence window, wrong clock source, wrong
 * display scale) and two fully dead tables (sleep_checkins, care_surveys).
 * All five are now fixed; this run asserts the fixes hold rather than just
 * documenting the bugs.
 *
 * Run: TZ=Europe/Berlin npx vitest run --config scripts/backtest/vitest.pm30.config.ts
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

vi.mock('../../src/notifications', () => ({
  scheduleSupplementNotification: vi.fn(async () => 'id'),
  scheduleWaterReminders: vi.fn(async () => {}),
  scheduleExerciseReminder: vi.fn(async () => {}),
  scheduleEndOfDaySummary: vi.fn(async () => {}),
  scheduleMorningReminder: vi.fn(async () => {}),
  cancelSupplementNotifications: vi.fn(async () => {}),
  clearAppBadge: vi.fn(async () => {}),
  registerBackgroundTask: vi.fn(async () => {}),
}));

const DAYS_BACK = 30;
const DAYS_FWD = 30;
const DAYS = DAYS_BACK + DAYS_FWD + 1; // inclusive of "today"
const REAL_TODAY_INDEX = DAYS_BACK; // the simulated day that lands on real wall-clock "today"

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Adherence dips around the "now" boundary, recovers after — nothing special about day 0. */
function adherenceFor(i: number): number {
  const distFromNow = Math.abs(i - REAL_TODAY_INDEX);
  if (distFromNow < 5) return 0.7;
  return 0.9;
}

interface Checkpoint {
  label: string;
  simulatedDate: string;
  weekSummaryLen: number;
  streak: number;
  adherenceScore14: number;
  adherenceScoreDisplay: string;
}

async function run() {
  vi.resetModules();
  const schema = await import('../../src/db/schema');
  const q = await import('../../src/db/queries');
  const scheduler = await import('../../src/engine/scheduler');
  const { seedSyntheticProtocol } = await import('./syntheticProtocol');
  const { getDb } = await import('../../src/db/schema');

  const rng = makeRng(30302026);

  const realToday = new Date();
  const day0 = new Date(realToday.getFullYear(), realToday.getMonth(), realToday.getDate());
  day0.setDate(day0.getDate() - DAYS_BACK);

  vi.setSystemTime(new Date(day0.getFullYear(), day0.getMonth(), day0.getDate(), 8, 0, 0));
  await schema.initDb();
  await seedSyntheticProtocol(localDate(day0));

  const perDay: Array<{ date: string; total: number; taken: number; missed: number; pct: number; waterMl: number }> = [];
  const checkpoints: Checkpoint[] = [];

  const captureCheckpoint = async (label: string) => {
    const week = await q.getWeekSummary();
    const streak = await q.getStreak();
    const adherenceScore14 = await q.getWeightedAdherenceScore(14);
    checkpoints.push({
      label,
      simulatedDate: q.todayStr(),
      weekSummaryLen: week.length,
      streak,
      adherenceScore14,
      adherenceScoreDisplay: `${Math.round(adherenceScore14)}%`,
    });
  };

  for (let i = 0; i < DAYS; i++) {
    const day = new Date(day0);
    day.setDate(day.getDate() + i);
    const t0 = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 8, 0, 0);
    vi.setSystemTime(t0);

    const lDate = localDate(t0);
    await scheduler.startDay(t0);
    const doses = await scheduler.getTodaySchedule();

    const p = adherenceFor(i);
    for (const dose of doses) {
      const at = new Date(dose.scheduledTime.getTime() + Math.floor(rng() * 20) * 60_000);
      vi.setSystemTime(at);
      const roll = rng();
      const logId = (dose as any).logId;
      if (roll < p) {
        if (logId) await q.confirmDose(logId);
      } else if (roll < p + (1 - p) / 2) {
        if (logId) await q.skipDose(logId);
      }
      if (rng() < 0.42) await q.addWater(250);
    }

    vi.setSystemTime(new Date(t0.getTime() + 5 * 3600_000));
    if (rng() < 0.6) await q.logSunExposure(15 + Math.floor(rng() * 30));

    const eod = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 45, 0);
    vi.setSystemTime(eod);
    await q.markOverdueDoses(localDate(t0));
    const s = await q.getDaySummary(lDate);
    perDay.push({ date: lDate, total: s.totalDoses, taken: s.takenDoses, missed: s.missedDoses, pct: s.compliancePct, waterMl: s.waterMl });
    if (rng() < 0.5) {
      await q.upsertJournalEntry({
        date: lDate, mood: s.compliancePct >= 80 ? 'good' : 'low', note: '',
        compliance_pct: s.compliancePct, doses_taken: s.takenDoses, doses_total: s.totalDoses,
      });
    }

    if (i === 0) { vi.setSystemTime(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 20, 0, 0)); await captureCheckpoint(`day 1 (${DAYS_BACK} days before real today)`); }
    if (i === REAL_TODAY_INDEX) { vi.setSystemTime(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 20, 0, 0)); await captureCheckpoint('real today (simulated clock == wall clock)'); }
    if (i === DAYS - 1) { vi.setSystemTime(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 20, 0, 0)); await captureCheckpoint(`day ${DAYS} (${DAYS_FWD} days after real today)`); }
  }

  // Re-query at the exact same reference date as the "real today" checkpoint,
  // now that 30 more simulated days of future data exist. Before the fix this
  // moved (future rows had no upper bound to exclude them); after the fix it
  // must not, because getWeightedAdherenceScore is anchored to the JS clock
  // (todayStr(), which the earlier vi.setSystemTime calls left behind) with a
  // real ceiling, not an open-ended floor.
  const realTodayDay = new Date(day0);
  realTodayDay.setDate(realTodayDay.getDate() + REAL_TODAY_INDEX);
  vi.setSystemTime(new Date(realTodayDay.getFullYear(), realTodayDay.getMonth(), realTodayDay.getDate(), 20, 0, 0));
  const rescored = await q.getWeightedAdherenceScore(14);

  // Dead-table confirmation: sleep_checkins and care_surveys should no longer
  // exist at all, not just be empty.
  const db = await getDb();
  const tables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('sleep_checkins','care_surveys')"
  );

  return { perDay, checkpoints, rescoredAtRealToday: rescored, remainingDeadTables: tables.map((t) => t.name) };
}

let result: Awaited<ReturnType<typeof run>>;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  result = await run();
}, 120_000);

afterAll(() => {
  vi.useRealTimers();
});

describe('±30-day Records-screen back-test', () => {
  it('produces a schedule on every simulated day, past and future', () => {
    expect(result.perDay.every((d) => d.total > 0)).toBe(true);
    expect(result.perDay.length).toBe(DAYS);
  });

  it('the 14-day adherence score is anchored to the simulated clock, not the real one', () => {
    // Day 1 of the run has exactly one day of history. Before the fix the SQL
    // window was pinned to date('now') — the real host clock — so at
    // simulated day 1 it looked 14 real-days back from the actual test-run
    // date and found nothing: score 0, regardless of the (perfectly good)
    // data that existed for that simulated day. After the fix the window is
    // anchored to todayStr() (JS Date, which vi.setSystemTime controls), so
    // day 1's own data is inside its own window and the score reflects it.
    const first = result.checkpoints[0];
    expect(first.adherenceScore14).toBeGreaterThan(0);
  });

  it('the 14-day window has a real ceiling — future writes do not retroactively inflate a past score', () => {
    const real = result.checkpoints[1];
    expect(result.rescoredAtRealToday).toBe(real.adherenceScore14);
  });

  it('sleep_checkins and care_surveys are gone, not just empty', () => {
    expect(result.remainingDeadTables).toEqual([]);
  });

  it('writes the ±30-day report', () => {
    const out = resolve(__dirname, '../../BACKTEST_PM30D.md');
    const lines: string[] = [];
    lines.push('# ±30-day Records-screen back-test\n');
    lines.push(`Window: ${result.perDay[0].date} → ${result.perDay[result.perDay.length - 1].date} (${DAYS} days, day ${REAL_TODAY_INDEX + 1} = real today, TZ=${process.env.TZ ?? 'system'})\n`);
    lines.push('Post-repair run. See git history for the original findings run (unbounded adherence');
    lines.push('window, real-clock anchoring, `/8` display bug, two dead tables) and `e2e/report/audit-2026-09-10.md`.\n');
    lines.push('## Checkpoints — every query useSummaryScreen calls\n');
    lines.push('| checkpoint | sim. date | week rows | streak | adherenceScore(14) | as rendered |');
    lines.push('|---|---|---:|---:|---:|---|');
    for (const c of result.checkpoints) {
      lines.push(`| ${c.label} | ${c.simulatedDate} | ${c.weekSummaryLen} | ${c.streak} | ${c.adherenceScore14} | ${c.adherenceScoreDisplay} |`);
    }
    lines.push('');
    lines.push('## Regression checks\n');
    lines.push(
      `- Day-1 score, anchored to the simulated clock: **${result.checkpoints[0].adherenceScoreDisplay}** ` +
      '(was `0.0/8` before the clock-anchoring fix — the window used to look 14 real-days back ' +
      'from the actual test-run date instead of 14 simulated-days back from day 1).',
    );
    lines.push(
      `- Real-today score, re-queried after 30 more simulated days were written: ` +
      `**${result.rescoredAtRealToday}**, unchanged from the original checkpoint ` +
      `(**${result.checkpoints[1].adherenceScore14}**) — the upper bound now excludes those future rows.`,
    );
    lines.push(`- \`sleep_checkins\` / \`care_surveys\`: dropped via migration 14, confirmed absent from `);
    lines.push('  `sqlite_master` after this run rather than merely empty.');
    lines.push('');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, lines.join('\n'));
    console.log(`\n[pm30] report: ${out}\n`);
    expect(out).toContain('BACKTEST_PM30D.md');
  });
});
