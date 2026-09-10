/**
 * 60-day back-test of a full protocol regimen.
 *
 * Drives the app's real data layer and scheduler day by day with a frozen,
 * stepped clock, then reads the results back through the same reporting
 * queries the UI uses. Nothing is stubbed except the notification layer
 * (native module) and expo-sqlite (aliased to node:sqlite).
 *
 * Run: TZ=Europe/Berlin npx vitest run --config scripts/backtest/vitest.backtest.config.ts
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

const DAYS = 60;
const WATER_GOAL_ML = 2500;
const GLASS_ML = 250;

// Deterministic PRNG — the same run every time, so a regression is a real
// regression and not a reroll.
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

/** Adherence profile: strong start, mid-protocol dip, recovery. */
function adherenceFor(i: number): number {
  if (i < 14) return 0.96;
  if (i < 40) return 0.80;
  return 0.93;
}

const SKIPPED_DAYS = new Set([12, 33, 34]); // app never opened
const LATE_START_DAY = 47;                  // T=0 at 00:30 local

interface SimResult {
  label: string;
  days: Array<{
    date: string;
    doseLogDate: string;
    total: number;
    taken: number;
    missed: number;
    pct: number;
    waterMl: number;
  }>;
  streak: number;
  week: Array<{ date: string; compliancePct: number }>;
  calendarWaterDays: number;
  calendarStartedDays: number;
  finalWater: { waterMl: number; goalMl: number };
  dateKeyMismatches: string[];
}

/**
 * @param useReload  false = the flow as HomeScreen ships it (dose list comes
 *                   straight from startDay()); true = the list is re-read via
 *                   getTodaySchedule(), which is what loadDay() does.
 */
async function runSim(label: string, useReload: boolean): Promise<SimResult> {
  vi.resetModules();
  const schema = await import('../../src/db/schema');
  const q = await import('../../src/db/queries');
  const scheduler = await import('../../src/engine/scheduler');
  const { seedSyntheticProtocol } = await import('./syntheticProtocol');

  const rng = makeRng(20260910);

  // Day 0 is DAYS-1 days before "today"; the run ends on today.
  const anchorNow = new Date();
  const day0 = new Date(anchorNow.getFullYear(), anchorNow.getMonth(), anchorNow.getDate());
  day0.setDate(day0.getDate() - (DAYS - 1));

  vi.setSystemTime(new Date(day0.getFullYear(), day0.getMonth(), day0.getDate(), 8, 0, 0));
  await schema.initDb();
  await seedSyntheticProtocol(localDate(day0));

  const dateKeyMismatches: string[] = [];
  const localDates: string[] = [];
  const doseLogDates: string[] = [];

  for (let i = 0; i < DAYS; i++) {
    const day = new Date(day0);
    day.setDate(day.getDate() + i);
    const startHour = i === LATE_START_DAY ? 0 : 8;
    const startMin = i === LATE_START_DAY ? 30 : 0;
    const t0 = new Date(day.getFullYear(), day.getMonth(), day.getDate(), startHour, startMin, 0);
    vi.setSystemTime(t0);

    const lDate = localDate(t0);
    const logDate = t0.toISOString().split('T')[0]; // what startDay() keys dose_logs by
    localDates.push(lDate);
    doseLogDates.push(logDate);
    if (lDate !== logDate) dateKeyMismatches.push(`${lDate} (dose_logs keyed ${logDate})`);

    if (SKIPPED_DAYS.has(i)) continue;

    const fromStartDay = await scheduler.startDay(t0);
    const doses = useReload ? await scheduler.getTodaySchedule() : fromStartDay;

    const p = adherenceFor(i);
    for (const dose of doses) {
      const at = new Date(dose.scheduledTime.getTime() + Math.floor(rng() * 20) * 60_000);
      vi.setSystemTime(at);
      const roll = rng();
      // The UI guards every write on dose.logId — reproduce that guard exactly.
      const logId = (dose as any).logId;
      if (roll < p) {
        if (logId) await q.confirmDose(logId);
      } else if (roll < p + (1 - p) / 2) {
        if (logId) await q.skipDose(logId);
      } // else: left to expire into 'missed' by markOverdueDoses

      // Water, logged through the day via the tracker's +250 ml action.
      if (rng() < 0.42) await q.addWater(GLASS_ML);
    }

    // Sun + journal, as a real day would carry them.
    vi.setSystemTime(new Date(t0.getTime() + 5 * 3600_000));
    if (rng() < 0.6) await q.logSunExposure(15 + Math.floor(rng() * 30));

    const eod = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 45, 0);
    vi.setSystemTime(eod);
    await q.markOverdueDoses(logDate);
    const s = await q.getDaySummary(lDate);
    if (rng() < 0.5) {
      await q.upsertJournalEntry({
        date: lDate, mood: s.compliancePct >= 80 ? 'good' : 'low', note: '',
        compliance_pct: s.compliancePct, doses_taken: s.takenDoses, doses_total: s.totalDoses,
      });
    }
  }

  // ── Read back through the app's own reporting queries ────────────────────
  const lastDay = new Date(day0);
  lastDay.setDate(lastDay.getDate() + DAYS - 1);
  vi.setSystemTime(new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate(), 20, 0, 0));

  const days: SimResult['days'] = [];
  for (let i = 0; i < DAYS; i++) {
    const s = await q.getDaySummary(localDates[i]);
    days.push({
      date: localDates[i], doseLogDate: doseLogDates[i],
      total: s.totalDoses, taken: s.takenDoses, missed: s.missedDoses,
      pct: s.compliancePct, waterMl: s.waterMl,
    });
  }

  const streak = await q.getStreak(localDates[DAYS - 1]);
  const week = await q.getWeekSummary();
  const finalWater = await q.getWaterProgress(localDates[DAYS - 1]);

  const months = new Set(localDates.map((d) => d.slice(0, 7)));
  let calendarWaterDays = 0, calendarStartedDays = 0;
  for (const m of months) {
    const [y, mo] = m.split('-').map(Number);
    const cal = await q.getCalendarMonth(y, mo - 1);
    for (const c of cal.values()) {
      if (localDates.includes(c.date)) {
        if (c.hasWater) calendarWaterDays++;
        if (c.started) calendarStartedDays++;
      }
    }
  }

  return { label, days, streak, week, calendarWaterDays, calendarStartedDays, finalWater, dateKeyMismatches };
}

function stats(r: SimResult) {
  const logged = r.days.filter((d) => d.total > 0);
  const taken = r.days.reduce((a, d) => a + d.taken, 0);
  const missed = r.days.reduce((a, d) => a + d.missed, 0);
  const scheduled = r.days.reduce((a, d) => a + d.total, 0);
  const water = r.days.reduce((a, d) => a + d.waterMl, 0);
  const goalDays = r.days.filter((d) => d.waterMl >= WATER_GOAL_ML).length;
  const waterDays = r.days.filter((d) => d.waterMl > 0).length;
  return {
    loggedDays: logged.length,
    scheduled, taken, missed,
    overallPct: scheduled ? Math.round((taken / scheduled) * 100) : 0,
    meanDayPct: logged.length ? Math.round(logged.reduce((a, d) => a + d.pct, 0) / logged.length) : 0,
    perfectDays: logged.filter((d) => d.pct === 100).length,
    waterTotalMl: water,
    waterDays,
    waterGoalDays: goalDays,
    meanWaterMl: waterDays ? Math.round(water / waterDays) : 0,
  };
}

let asShipped: SimResult;
let viaReload: SimResult;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  asShipped = await runSim('as shipped (dose list from startDay)', false);
  viaReload = await runSim('via getTodaySchedule (loadDay path)', true);
}, 120_000);

afterAll(() => {
  vi.useRealTimers();
});

describe('60-day protocol back-test', () => {
  it('schedules a full regimen on every day the app was opened', () => {
    const opened = viaReload.days.filter((d) => d.total > 0).length;
    expect(opened).toBe(DAYS - SKIPPED_DAYS.size);
  });

  it('records water through the tracker on most days', () => {
    expect(stats(viaReload).waterDays).toBeGreaterThan(40);
    expect(viaReload.finalWater.goalMl).toBe(WATER_GOAL_ML);
  });

  it('surfaces water on the calendar for every day water was logged', () => {
    expect(viaReload.calendarWaterDays).toBe(stats(viaReload).waterDays);
  });

  it('reports the same compliance the simulated adherence implies', () => {
    const s = stats(viaReload);
    expect(s.overallPct).toBeGreaterThan(80);
    expect(s.overallPct).toBeLessThan(95);
  });

  it('writes the back-test report', () => {
    const a = stats(asShipped), b = stats(viaReload);
    const out = resolve(__dirname, '../../BACKTEST_60D.md');
    const lines: string[] = [];
    lines.push('# 60-day protocol back-test\n');
    lines.push(`Window: ${viaReload.days[0].date} → ${viaReload.days[DAYS - 1].date} (${DAYS} days, TZ=${process.env.TZ ?? 'system'})`);
    lines.push(`Regimen: ${viaReload.days.find((d) => d.total > 0)?.total} scheduled doses/day, 6 anchors from T=0.`);
    lines.push(`Simulated: ${SKIPPED_DAYS.size} days the app was never opened, one T=0 at 00:30 local.\n`);
    lines.push('## Result, by flow\n');
    lines.push('| metric | as shipped | via loadDay reload |');
    lines.push('|---|---:|---:|');
    const row = (k: string, x: any, y: any) => lines.push(`| ${k} | ${x} | ${y} |`);
    row('days with a schedule', a.loggedDays, b.loggedDays);
    row('doses scheduled', a.scheduled, b.scheduled);
    row('doses taken', a.taken, b.taken);
    row('doses missed', a.missed, b.missed);
    row('overall compliance', `${a.overallPct}%`, `${b.overallPct}%`);
    row('mean day compliance', `${a.meanDayPct}%`, `${b.meanDayPct}%`);
    row('100% days', a.perfectDays, b.perfectDays);
    row('current streak', asShipped.streak, viaReload.streak);
    row('days with water logged', a.waterDays, b.waterDays);
    row('days hitting 2.5 L', a.waterGoalDays, b.waterGoalDays);
    row('mean water on logged days', `${a.meanWaterMl} ml`, `${b.meanWaterMl} ml`);
    row('calendar days flagged hasWater', asShipped.calendarWaterDays, viaReload.calendarWaterDays);
    row('calendar days flagged started', asShipped.calendarStartedDays, viaReload.calendarStartedDays);
    lines.push('');
    lines.push('## Date-key divergence (dose_logs UTC vs anchors local)\n');
    lines.push(viaReload.dateKeyMismatches.length
      ? viaReload.dateKeyMismatches.map((m) => `- ${m}`).join('\n')
      : '- none in this window');
    lines.push('');
    lines.push('## Per-day (via loadDay reload)\n');
    lines.push('| date | scheduled | taken | missed | % | water |');
    lines.push('|---|---:|---:|---:|---:|---:|');
    for (const d of viaReload.days) {
      lines.push(`| ${d.date} | ${d.total} | ${d.taken} | ${d.missed} | ${d.pct}% | ${d.waterMl} ml |`);
    }
    lines.push('');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, lines.join('\n'));
    console.log(`\n[backtest] as shipped   : ${a.taken}/${a.scheduled} taken (${a.overallPct}%), streak ${asShipped.streak}`);
    console.log(`[backtest] via reload   : ${b.taken}/${b.scheduled} taken (${b.overallPct}%), streak ${viaReload.streak}`);
    console.log(`[backtest] water        : ${b.waterDays} days logged, ${b.waterGoalDays} at goal, mean ${b.meanWaterMl} ml`);
    console.log(`[backtest] report       : ${out}\n`);
    expect(out).toContain('BACKTEST_60D.md');
  });
});
