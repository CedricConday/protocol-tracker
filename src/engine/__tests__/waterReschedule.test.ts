/**
 * The water reminders quote the goal they were written with, so a goal change
 * has to rewrite them. Until 2026-09-17 nothing did: `scheduleWaterReminders`
 * had one caller, `startDay`, and the Water screen only wrote the flag.
 *
 * These pin the two properties the fix depends on — it reschedules from the
 * day's own T=0, and two calls never overlap.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const scheduleWaterReminders = vi.fn(async () => {});
let anchor: { t0_timestamp: number | null } | null = { t0_timestamp: 1_789_000_000_000 };

vi.mock('react-native', () => ({ NativeModules: {}, Platform: { OS: 'ios' } }));
vi.mock('../../i18n', () => ({ t: (k: string) => k, locale: () => 'en' }));
vi.mock('../../notifications', () => ({
  scheduleWaterReminders: (...a: unknown[]) => scheduleWaterReminders(...(a as [])),
  scheduleExerciseReminder: vi.fn(),
  scheduleEndOfDaySummary: vi.fn(),
  cancelMorningReminder: vi.fn(),
  scheduleSupplementNotification: vi.fn(),
  cancelSupplementNotifications: vi.fn(),
}));
vi.mock('../../db/queries', () => ({
  getAnchor: async () => anchor,
  todayStr: () => '2026-09-17',
  getProfile: vi.fn(),
  getMiscFlag: vi.fn(),
  localDateStr: vi.fn(),
  getScheduleRules: vi.fn(),
  setT0: vi.fn(),
  createDoseLogs: vi.fn(),
  getDoseLogs: vi.fn(),
  markOverdueDoses: vi.fn(),
}));

import { rescheduleWaterReminders, WATER_WINDOW_MS } from '../scheduler';

describe('rescheduling the day\'s water reminders', () => {
  beforeEach(() => {
    scheduleWaterReminders.mockClear();
    anchor = { t0_timestamp: 1_789_000_000_000 };
  });

  it('rewrites them across the window the day was opened with', async () => {
    await rescheduleWaterReminders();
    expect(scheduleWaterReminders).toHaveBeenCalledTimes(1);
    const [t0, end] = scheduleWaterReminders.mock.calls[0] as unknown as [Date, Date];
    expect(t0.getTime()).toBe(1_789_000_000_000);
    expect(end.getTime() - t0.getTime()).toBe(WATER_WINDOW_MS);
  });

  it('does nothing when the day was never started', async () => {
    anchor = null;
    await rescheduleWaterReminders();
    expect(scheduleWaterReminders).not.toHaveBeenCalled();

    anchor = { t0_timestamp: null };
    await rescheduleWaterReminders();
    expect(scheduleWaterReminders).not.toHaveBeenCalled();
  });

  it('collapses a burst into one run and one trailing run, never overlapping', async () => {
    const pending: (() => void)[] = [];
    let running = 0;
    let overlapped = false;
    scheduleWaterReminders.mockImplementation(async () => {
      running += 1;
      if (running > 1) overlapped = true;
      await new Promise<void>((resolve) => pending.push(() => { running -= 1; resolve(); }));
    });
    const tick = () => new Promise((r) => setTimeout(r, 0));

    // One tap, then six more while the first pass is still in flight.
    const calls = Array.from({ length: 7 }, () => rescheduleWaterReminders());
    await tick();
    expect(scheduleWaterReminders).toHaveBeenCalledTimes(1);

    pending.shift()!();          // the first pass finishes
    await tick();
    expect(scheduleWaterReminders).toHaveBeenCalledTimes(2);  // one trailing pass, not six

    pending.shift()!();
    await Promise.all(calls);

    expect(overlapped).toBe(false);
    expect(scheduleWaterReminders).toHaveBeenCalledTimes(2);
  });
});
