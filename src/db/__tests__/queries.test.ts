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

  it('handles an empty dose list gracefully', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    mockDb.getFirstAsync.mockResolvedValueOnce(null);

    const result = await getDaySummary();
    expect(result.totalDoses).toBe(0);
    expect(result.compliancePct).toBe(0);
    expect(result.t0).toBeNull();
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
