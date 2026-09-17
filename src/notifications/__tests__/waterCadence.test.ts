/**
 * Water reminder cadence.
 *
 * The regression being pinned is a count: nine reminders a day, asking for
 * 500 ml each, against a 2500 ml goal. The count now follows the goal, and the
 * window and the count are independent of each other.
 */

import { describe, it, expect } from 'vitest';
import { waterReminderTimes, WATER_NUDGE_ML, MAX_WATER_REMINDERS } from '../waterCadence';

const T0 = new Date(2026, 8, 17, 8, 0, 0);
const twelveHoursOn = new Date(T0.getTime() + 12 * 60 * 60 * 1000);
const minutesAfterT0 = (d: Date) => Math.round((d.getTime() - T0.getTime()) / 60_000);

describe('waterReminderTimes', () => {
  it('sends one reminder per glass of the goal', () => {
    const times = waterReminderTimes(T0, twelveHoursOn, 2500, 0);
    expect(times).toHaveLength(2500 / WATER_NUDGE_ML);
  });

  it('never fires at T=0, and finishes on the end of the window', () => {
    const times = waterReminderTimes(T0, twelveHoursOn, 2500, 0);
    expect(minutesAfterT0(times[0])).toBe(144); // 2h24, not "the moment you tapped start"
    expect(minutesAfterT0(times[times.length - 1])).toBe(12 * 60);
  });

  it('spaces them evenly across whatever window it is given', () => {
    const times = waterReminderTimes(T0, twelveHoursOn, 2500, 0);
    const gaps = times.slice(1).map((d, i) => d.getTime() - times[i].getTime());
    expect(new Set(gaps).size).toBe(1);

    // Half the window, same goal: same count, closer together. The old fixed
    // 90-minute step made the count a function of the window instead.
    const short = waterReminderTimes(T0, new Date(T0.getTime() + 6 * 60 * 60 * 1000), 2500, 0);
    expect(short).toHaveLength(times.length);
    expect(minutesAfterT0(short[0])).toBe(72);
  });

  it('follows the goal when the goal is edited', () => {
    expect(waterReminderTimes(T0, twelveHoursOn, 1000, 0)).toHaveLength(2);
    expect(waterReminderTimes(T0, twelveHoursOn, 1500, 0)).toHaveLength(3);
    // A part-glass remainder still earns a reminder.
    expect(waterReminderTimes(T0, twelveHoursOn, 1200, 0)).toHaveLength(3);
  });

  it('counts only what is left to drink', () => {
    expect(waterReminderTimes(T0, twelveHoursOn, 2500, 1000)).toHaveLength(3);
  });

  it('schedules nothing once the goal is met', () => {
    expect(waterReminderTimes(T0, twelveHoursOn, 2500, 2500)).toEqual([]);
    expect(waterReminderTimes(T0, twelveHoursOn, 2500, 4000)).toEqual([]);
  });

  it('caps a large goal rather than reminding all day', () => {
    expect(waterReminderTimes(T0, twelveHoursOn, 10_000, 0)).toHaveLength(MAX_WATER_REMINDERS);
  });

  it('returns nothing for a window that does not exist', () => {
    expect(waterReminderTimes(T0, T0, 2500, 0)).toEqual([]);
    expect(waterReminderTimes(twelveHoursOn, T0, 2500, 0)).toEqual([]);
  });
});
