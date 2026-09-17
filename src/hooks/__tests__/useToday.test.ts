/**
 * The day clock. What is under test is the part that has to be right without a
 * device: when the next wake-up is armed for, and that subscribers are told
 * once — and only once — per real day change.
 *
 * `react-native` is mocked down to the one API this module uses. `../../db/queries`
 * would pull expo-sqlite in, so `todayStr` is mocked to read the fake clock.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const appStateListeners: ((state: string) => void)[] = [];

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_event: string, cb: (state: string) => void) => {
      appStateListeners.push(cb);
      return { remove: () => {
        const i = appStateListeners.indexOf(cb);
        if (i >= 0) appStateListeners.splice(i, 1);
      } };
    },
  },
}));

vi.mock('../../db/queries', () => ({
  todayStr: () => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  },
}));

import { subscribeDay, currentDay, msUntilNextMidnight, __resetDayClock } from '../useToday';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  __resetDayClock();
  appStateListeners.length = 0;
  vi.useRealTimers();
});

describe('msUntilNextMidnight', () => {
  it('measures to the next local midnight, plus a cushion', () => {
    // 22:00 → two hours, and a second past the boundary so the wake-up reads
    // the new day rather than the last millisecond of the old one.
    const at22 = new Date(2026, 8, 17, 22, 0, 0);
    expect(msUntilNextMidnight(at22)).toBe(2 * 60 * 60 * 1000 + 1_000);
  });

  it('never returns a delay that would spin', () => {
    const oneMsBefore = new Date(2026, 8, 17, 23, 59, 59, 999);
    expect(msUntilNextMidnight(oneMsBefore)).toBeGreaterThanOrEqual(1_000);
  });

  it('crosses a spring-forward boundary as a real local midnight', () => {
    // Europe/Berlin loses an hour at 02:00 on 2027-03-28, well after midnight,
    // so the boundary itself is unmoved: from 23:00 it is still one hour away.
    // The point is that the answer comes from the calendar, not from +24h.
    const at23 = new Date(2027, 2, 27, 23, 0, 0);
    expect(msUntilNextMidnight(at23)).toBe(60 * 60 * 1000 + 1_000);
  });
});

describe('the day clock', () => {
  it('notifies subscribers once when the clock crosses midnight', () => {
    vi.setSystemTime(new Date(2026, 8, 17, 23, 59, 0));
    const seen: string[] = [];
    subscribeDay((d) => seen.push(d));
    expect(currentDay()).toBe('2026-09-17');

    vi.advanceTimersByTime(2 * 60 * 1000); // past midnight
    expect(seen).toEqual(['2026-09-18']);

    vi.advanceTimersByTime(60 * 60 * 1000); // an hour into the new day
    expect(seen).toEqual(['2026-09-18']);
  });

  it('catches up on foreground when the timer never fired', () => {
    vi.setSystemTime(new Date(2026, 8, 17, 23, 0, 0));
    const seen: string[] = [];
    subscribeDay((d) => seen.push(d));

    // A sleeping phone: the clock moves but no timer runs.
    vi.setSystemTime(new Date(2026, 8, 18, 8, 0, 0));
    expect(seen).toEqual([]);

    appStateListeners.forEach((l) => l('active'));
    expect(seen).toEqual(['2026-09-18']);
  });

  it('stops the timer once the last subscriber leaves', () => {
    vi.setSystemTime(new Date(2026, 8, 17, 23, 59, 0));
    const seen: string[] = [];
    const off = subscribeDay((d) => seen.push(d));
    off();

    expect(vi.getTimerCount()).toBe(0);
    expect(appStateListeners).toHaveLength(0);
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(seen).toEqual([]);
  });
});
