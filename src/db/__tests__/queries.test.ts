/**
 * Unit tests for queries.ts
 * The schema module (and with it expo-sqlite) is mocked — these test the query
 * logic and data transformations, not the native SQLite driver.
 * Run with `npm test`.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../schema', () => ({
  getDb: vi.fn(),
}));

import { getDb } from '../schema';
import {
  todayStr,
  getDaySummary,
  getStreak,
  getWaterProgress,
  getWeekSummary,
  addSupplement,
  undoLastWater,
  correctWaterLog,
  clearSunLog,
  confirmDose,
  skipDose,
} from '../queries';

const mockDb = {
  getFirstAsync: vi.fn(),
  getAllAsync: vi.fn(),
  runAsync: vi.fn(),
  withTransactionAsync: vi.fn((cb: () => Promise<void>) => cb()),
};

beforeEach(() => {
  vi.clearAllMocks();
  (getDb as unknown as Mock).mockResolvedValue(mockDb);
});

// ── todayStr ──────────────────────────────────────────────────────────────────

describe('todayStr', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('matches today in local time', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(todayStr()).toBe(expected);
  });
});

// ── getWaterProgress ──────────────────────────────────────────────────────────

describe('getWaterProgress', () => {
  it('returns water ml and a goal when an anchor exists', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ water_ml: 1500 });

    const result = await getWaterProgress();
    expect(result.waterMl).toBe(1500);
    expect(result.goalMl).toBeGreaterThan(0);
  });

  it('returns 0 water when there is no anchor for today', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);

    const result = await getWaterProgress();
    expect(result.waterMl).toBe(0);
  });
});

// ── getDaySummary ─────────────────────────────────────────────────────────────
// getDaySummary reads one grouped row per dose status ({status, count}) plus the
// day's anchor, so the fixtures below mirror that shape.

describe('getDaySummary', () => {
  it('computes 100% compliance when every dose is taken', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([{ status: 'taken', count: 3 }]);
    mockDb.getFirstAsync.mockResolvedValueOnce({ water_ml: 2000, t0_timestamp: Date.now() });

    const result = await getDaySummary();
    expect(result.compliancePct).toBe(100);
    expect(result.totalDoses).toBe(3);
    expect(result.takenDoses).toBe(3);
  });

  it('computes 0% compliance when no dose is taken', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([{ status: 'upcoming', count: 2 }]);
    mockDb.getFirstAsync.mockResolvedValueOnce({ water_ml: 0, t0_timestamp: null });

    const result = await getDaySummary();
    expect(result.compliancePct).toBe(0);
    expect(result.totalDoses).toBe(2);
  });

  it('counts missed doses against compliance', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { status: 'taken', count: 3 },
      { status: 'missed', count: 1 },
    ]);
    mockDb.getFirstAsync.mockResolvedValueOnce({ water_ml: 500, t0_timestamp: Date.now() });

    const result = await getDaySummary();
    expect(result.totalDoses).toBe(4);
    expect(result.missedDoses).toBe(1);
    expect(result.compliancePct).toBe(75);
  });

  it('keeps a skipped dose in the denominator, exactly where missed put it', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { status: 'taken', count: 3 },
      { status: 'skipped', count: 1 },
    ]);
    mockDb.getFirstAsync.mockResolvedValueOnce({ water_ml: 500, t0_timestamp: Date.now() });

    const result = await getDaySummary();
    // Same four doses, same 75% the row produced when a skip was stored as
    // 'missed'. A status left out of the counts object drops out of the total
    // instead, and compliance silently rises to 100%.
    expect(result.totalDoses).toBe(4);
    expect(result.compliancePct).toBe(75);
    expect(result.skippedDoses).toBe(1);
    expect(result.missedDoses).toBe(1);
  });

  it('separates a deliberate skip from an untouched missed dose', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { status: 'taken', count: 2 },
      { status: 'missed', count: 1 },
      { status: 'skipped', count: 1 },
    ]);
    mockDb.getFirstAsync.mockResolvedValueOnce({ water_ml: 0, t0_timestamp: Date.now() });

    const result = await getDaySummary();
    expect(result.totalDoses).toBe(4);
    expect(result.skippedDoses).toBe(1);
    expect(result.missedDoses).toBe(2); // not taken, either way — the doctor report totals this
    expect(result.compliancePct).toBe(50);
  });

  it('handles an empty dose list gracefully', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    mockDb.getFirstAsync.mockResolvedValueOnce(null);

    const result = await getDaySummary();
    expect(result.totalDoses).toBe(0);
    expect(result.compliancePct).toBe(0);
    expect(result.t0).toBeNull();
  });
});

// ── confirmDose / skipDose ────────────────────────────────────────────────────
// Both run through applyDoseStatus, which owns the two rules a correction made
// necessary: when `logged_time` may be stamped "now", and when a pill leaves or
// returns to the bottle.

describe('confirmDose and skipDose', () => {
  const sqlOf = (call: unknown[]) => String(call[0]);
  const runSql = () => mockDb.runAsync.mock.calls.map(sqlOf);
  const statusUpdate = () =>
    mockDb.runAsync.mock.calls.find((c) => sqlOf(c).includes('UPDATE dose_logs SET status'));

  it('stamps a past dose with its scheduled time, not the moment of the correction', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({
      supplement_id: 'vit_d3', date: '2026-09-01', status: 'missed', scheduled_time: 1_756_700_000_000,
    });

    await confirmDose(7);

    // ['taken', logged_time, logId] — a correction three weeks later cannot
    // claim the dose was swallowed at this minute.
    expect(statusUpdate()?.[1]).toEqual(['taken', 1_756_700_000_000, 7]);
  });

  it("stamps today's dose with the current time", async () => {
    const before = Date.now();
    mockDb.getFirstAsync.mockResolvedValueOnce({
      supplement_id: 'vit_d3', date: todayStr(), status: 'due', scheduled_time: 1_000,
    });

    await confirmDose(3);

    const stamped = (statusUpdate()?.[1] as unknown[])[1] as number;
    expect(stamped).toBeGreaterThanOrEqual(before);
  });

  it('takes a pill out of the bottle once, however often the dose is re-confirmed', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({
      supplement_id: 'vit_d3', date: todayStr(), status: 'taken', scheduled_time: 1_000,
    });

    await confirmDose(3);

    expect(runSql().some((sql) => sql.includes('quantity_on_hand - 1'))).toBe(false);
  });

  it('puts the pill back when a taken dose is corrected to skipped', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({
      supplement_id: 'vit_d3', date: '2026-09-01', status: 'taken', scheduled_time: 1_756_700_000_000,
    });

    await skipDose(7);

    expect(runSql().some((sql) => sql.includes('quantity_on_hand + 1'))).toBe(true);
    expect(runSql().some((sql) => sql.includes('quantity_on_hand - 1'))).toBe(false);
  });

  it('does not consume a pill for a dose that was never taken', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({
      supplement_id: 'vit_d3', date: todayStr(), status: 'due', scheduled_time: 1_000,
    });

    await skipDose(3);

    expect(runSql().some((sql) => sql.includes('quantity_on_hand'))).toBe(false);
  });
});

// ── getStreak ─────────────────────────────────────────────────────────────────
// getStreak walks grouped rows ({date, total, taken}) newest-first and stops at
// the first day that is not fully taken.

describe('getStreak', () => {
  it('returns 0 when no dose logs exist', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    const streak = await getStreak();
    expect(streak).toBe(0);
  });

  it('counts consecutive fully-compliant days', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { date: '2026-09-10', total: 3, taken: 3 },
      { date: '2026-09-09', total: 3, taken: 3 },
      { date: '2026-09-08', total: 2, taken: 2 },
    ]);

    const streak = await getStreak('2026-09-10');
    expect(streak).toBe(3);
  });

  it('stops counting at a day with a missed dose', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { date: '2026-09-10', total: 3, taken: 3 },
      { date: '2026-09-09', total: 3, taken: 1 }, // break
      { date: '2026-09-08', total: 3, taken: 3 },
    ]);

    const streak = await getStreak('2026-09-10');
    expect(streak).toBe(1);
  });
});

// ── getWeekSummary ────────────────────────────────────────────────────────────
// getWeekSummary calls getDaySummary once per day, so the mocks answer every
// call rather than only the first.

describe('getWeekSummary', () => {
  it('returns 7 entries, oldest first', async () => {
    mockDb.getAllAsync.mockResolvedValue([{ status: 'taken', count: 2 }]);
    mockDb.getFirstAsync.mockResolvedValue({ water_ml: 1000, t0_timestamp: null });

    const result = await getWeekSummary();
    expect(result).toHaveLength(7);
    expect(result[0].date < result[6].date).toBe(true);
  });

  it('keeps compliance values within 0–100', async () => {
    mockDb.getAllAsync.mockResolvedValue([
      { status: 'taken', count: 1 },
      { status: 'missed', count: 1 },
    ]);
    mockDb.getFirstAsync.mockResolvedValue(null);

    const result = await getWeekSummary();
    result.forEach(r => {
      expect(r.compliancePct).toBeGreaterThanOrEqual(0);
      expect(r.compliancePct).toBeLessThanOrEqual(100);
    });
  });
});

// ── mid-day supplement materialises a dose (2.4) ─────────────────────────────

describe('addSupplement', () => {
  const data = {
    name: 'Magnesium', form: 'capsule',
    dose_amount: '400', dose_unit: 'mg',
    offset_minutes: 120, with_food: true, tolerance_window: 30,
  };

  it('writes a dose_log for today when the day has been started', async () => {
    const t0 = Date.now() - 60 * 60 * 1000;            // started an hour ago
    mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 42, changes: 1 });
    mockDb.getFirstAsync.mockResolvedValue({ t0_timestamp: t0 });

    await addSupplement(data);

    const inserts = mockDb.runAsync.mock.calls.map((c) => String(c[0]));
    const doseInsert = inserts.find((q) => q.includes('INSERT INTO dose_logs'));
    expect(doseInsert).toBeDefined();
    const args = mockDb.runAsync.mock.calls.find((c) => String(c[0]).includes('INSERT INTO dose_logs'))![1] as unknown[];
    expect(args[2]).toBe(42);                          // the rule just inserted
    expect(args[3]).toBe(t0 + 120 * 60 * 1000);        // t0 + offset
  });

  it('does not write a dose_log before the day is started', async () => {
    mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 7, changes: 1 });
    mockDb.getFirstAsync.mockResolvedValue(null);      // no anchor yet

    await addSupplement(data);

    const inserts = mockDb.runAsync.mock.calls.map((c) => String(c[0]));
    expect(inserts.some((q) => q.includes('INSERT INTO dose_logs'))).toBe(false);
  });

  it('marks a dose whose time has already passed as due, not upcoming', async () => {
    mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 9, changes: 1 });
    mockDb.getFirstAsync.mockResolvedValue({ t0_timestamp: Date.now() - 5 * 60 * 60 * 1000 });

    await addSupplement(data);                         // offset 120min, so 3h in the past

    const args = mockDb.runAsync.mock.calls.find((c) => String(c[0]).includes('INSERT INTO dose_logs'))![1] as unknown[];
    expect(args[4]).toBe('due');
  });

  it('marks a dose still ahead of the clock as upcoming', async () => {
    mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 9, changes: 1 });
    mockDb.getFirstAsync.mockResolvedValue({ t0_timestamp: Date.now() });

    await addSupplement(data);                         // offset 120min, two hours out

    const args = mockDb.runAsync.mock.calls.find((c) => String(c[0]).includes('INSERT INTO dose_logs'))![1] as unknown[];
    expect(args[4]).toBe('upcoming');
  });
});

// ── water and sun are correctable (2.5) ──────────────────────────────────────

describe('undoLastWater', () => {
  it('removes the newest entry and takes it off the day total', async () => {
    mockDb.getFirstAsync.mockResolvedValue({ id: 5, amount_ml: 250 });

    const removed = await undoLastWater('2026-09-13');

    expect(removed).toBe(250);
    const del = mockDb.runAsync.mock.calls.find((c) => String(c[0]).startsWith('DELETE FROM water_logs'));
    expect(del![1]).toEqual([5]);
    const upd = mockDb.runAsync.mock.calls.find((c) => String(c[0]).includes('UPDATE daily_anchors'));
    expect(String(upd![0])).toContain('MAX(0, water_ml - ?)');
    expect(upd![1]).toEqual([250, '2026-09-13']);
  });

  it('is a no-op when the day has no entries', async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);
    expect(await undoLastWater('2026-09-13')).toBeNull();
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });
});

describe('correctWaterLog', () => {
  it('moves the day total by the difference, not by the new value', async () => {
    mockDb.getFirstAsync.mockResolvedValue({ date: '2026-09-13', amount_ml: 750 });

    await correctWaterLog(5, 250);

    const upd = mockDb.runAsync.mock.calls.find((c) => String(c[0]).includes('UPDATE water_logs'));
    expect(upd![1]).toEqual([250, 5]);
    const anchor = mockDb.runAsync.mock.calls.find((c) => String(c[0]).includes('UPDATE daily_anchors'));
    expect(anchor![1]).toEqual([-500, '2026-09-13']);
  });

  it('ignores an unknown entry', async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);
    await correctWaterLog(999, 250);
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });
});

describe('clearSunLog', () => {
  it('deletes the day row', async () => {
    await clearSunLog('2026-09-13');
    expect(mockDb.runAsync).toHaveBeenCalledWith('DELETE FROM sun_log WHERE date = ?', ['2026-09-13']);
  });
});
