/**
 * Unit tests for queries.ts
 * expo-sqlite is mocked — these test the query logic and data transformations,
 * not the native SQLite driver.
 */

jest.mock('../schema', () => ({
  getDb: jest.fn(),
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
  getFirstAsync: jest.fn(),
  getAllAsync: jest.fn(),
  runAsync: jest.fn(),
  withTransactionAsync: jest.fn((cb: () => Promise<void>) => cb()),
};

beforeEach(() => {
  jest.clearAllMocks();
  (getDb as jest.Mock).mockResolvedValue(mockDb);
});

// ── todayStr ──────────────────────────────────────────────────────────────────

describe('todayStr', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('matches today', () => {
    const expected = new Date().toISOString().split('T')[0];
    expect(todayStr()).toBe(expected);
  });
});

// ── getWaterProgress ──────────────────────────────────────────────────────────

describe('getWaterProgress', () => {
  it('returns water ml and default goal when anchor exists', async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ water_ml: 1500 })    // anchor
      .mockResolvedValueOnce({ weight_kg: 70 });     // profile

    const result = await getWaterProgress();
    expect(result.waterMl).toBe(1500);
    expect(result.goalMl).toBeGreaterThan(0);
  });

  it('returns 0 water when no anchor for today', async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce(null)   // no anchor
      .mockResolvedValueOnce({ weight_kg: 60 });

    const result = await getWaterProgress();
    expect(result.waterMl).toBe(0);
  });
});

// ── getDaySummary ─────────────────────────────────────────────────────────────

describe('getDaySummary', () => {
  it('computes 100% compliance when all doses confirmed', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { status: 'confirmed' },
      { status: 'confirmed' },
      { status: 'confirmed' },
    ]);
    mockDb.getFirstAsync.mockResolvedValue({ water_ml: 2000, t0_timestamp: Date.now() });

    const result = await getDaySummary();
    expect(result.compliancePct).toBe(100);
    expect(result.totalDoses).toBe(3);
    expect(result.confirmedDoses).toBe(3);
  });

  it('computes 0% compliance when no doses confirmed', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { status: 'upcoming' },
      { status: 'upcoming' },
    ]);
    mockDb.getFirstAsync.mockResolvedValue({ water_ml: 0, t0_timestamp: null });

    const result = await getDaySummary();
    expect(result.compliancePct).toBe(0);
  });

  it('handles empty dose list gracefully', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    mockDb.getFirstAsync.mockResolvedValue(null);

    const result = await getDaySummary();
    expect(result.totalDoses).toBe(0);
    expect(result.compliancePct).toBe(0);
  });
});

// ── getStreak ─────────────────────────────────────────────────────────────────

describe('getStreak', () => {
  it('returns 0 when no dose logs exist', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    const streak = await getStreak();
    expect(streak).toBe(0);
  });

  it('counts consecutive compliant days', async () => {
    const today = todayStr();
    const yesterday = new Date(Date.now() - 86400_000).toISOString().split('T')[0];
    const twoDaysAgo = new Date(Date.now() - 2 * 86400_000).toISOString().split('T')[0];

    mockDb.getAllAsync.mockResolvedValueOnce([
      { date: today, compliancePct: 100 },
      { date: yesterday, compliancePct: 85 },
      { date: twoDaysAgo, compliancePct: 90 },
    ]);

    const streak = await getStreak();
    expect(streak).toBeGreaterThanOrEqual(3);
  });

  it('stops counting at a missed day', async () => {
    const today = todayStr();
    const yesterday = new Date(Date.now() - 86400_000).toISOString().split('T')[0];
    const threeDaysAgo = new Date(Date.now() - 3 * 86400_000).toISOString().split('T')[0];

    mockDb.getAllAsync.mockResolvedValueOnce([
      { date: today, compliancePct: 100 },
      { date: yesterday, compliancePct: 0 },      // break
      { date: threeDaysAgo, compliancePct: 100 },
    ]);

    const streak = await getStreak();
    expect(streak).toBeLessThan(3);
  });
});

// ── getWeekSummary ────────────────────────────────────────────────────────────

describe('getWeekSummary', () => {
  it('returns 7 entries', async () => {
    const days = Array.from({ length: 7 }, (_, i) => ({
      date: new Date(Date.now() - i * 86400_000).toISOString().split('T')[0],
      compliancePct: 80,
    }));
    mockDb.getAllAsync.mockResolvedValueOnce(days);

    const result = await getWeekSummary();
    expect(result).toHaveLength(7);
  });

  it('compliance values are 0–100', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { date: '2026-05-12', compliancePct: 100 },
      { date: '2026-05-13', compliancePct: 50 },
      { date: '2026-05-14', compliancePct: 0 },
    ]);

    const result = await getWeekSummary();
    result.forEach(r => {
      expect(r.compliancePct).toBeGreaterThanOrEqual(0);
      expect(r.compliancePct).toBeLessThanOrEqual(100);
    });
  });
});
