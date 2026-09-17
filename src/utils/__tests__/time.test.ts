/**
 * Times of day. The bedtime revamp (2026-09-16) turned bedtime from a menu of
 * six evening hours into any time of day, which put two things under load: the
 * forgiving parser both screens now share, and the rollover that makes a
 * post-midnight bedtime mean tonight rather than this morning.
 *
 * `../time` reaches `../i18n` for the locale, which pulls in AsyncStorage, so
 * both are mocked — these are tests of arithmetic, not of storage.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));

vi.mock('../../i18n', () => ({
  locale: () => 'en-GB',
}));

import { parseTimeOfDay, bedtimeAfter, averageTimeOfDay, logTimeAfterEdit } from '../time';

describe('parseTimeOfDay', () => {
  it('takes the shapes a person actually types', () => {
    expect(parseTimeOfDay('7:5')).toEqual({ hour: 7, minute: 5 });
    expect(parseTimeOfDay('07:05')).toEqual({ hour: 7, minute: 5 });
    expect(parseTimeOfDay('0705')).toEqual({ hour: 7, minute: 5 });
    expect(parseTimeOfDay('7.05')).toEqual({ hour: 7, minute: 5 });
    expect(parseTimeOfDay('23')).toEqual({ hour: 23, minute: 0 });
    expect(parseTimeOfDay('4 30 pm')).toEqual({ hour: 16, minute: 30 });
    expect(parseTimeOfDay('12 15 am')).toEqual({ hour: 0, minute: 15 });
  });

  it('reaches the times the old picker could not express', () => {
    // Hours 18-23, minutes 0/15/30/45 was the whole menu before the revamp.
    expect(parseTimeOfDay('01:30')).toEqual({ hour: 1, minute: 30 });
    expect(parseTimeOfDay('2350')).toEqual({ hour: 23, minute: 50 });
    expect(parseTimeOfDay('00:00')).toEqual({ hour: 0, minute: 0 });
  });

  it('returns null rather than guessing', () => {
    expect(parseTimeOfDay('')).toBeNull();
    expect(parseTimeOfDay('later')).toBeNull();
    expect(parseTimeOfDay('25:00')).toBeNull();
    expect(parseTimeOfDay('10:75')).toBeNull();
  });
});

describe('bedtimeAfter', () => {
  it('is today when the time has not passed yet', () => {
    const from = new Date(2026, 8, 16, 14, 0);
    const bed = bedtimeAfter(from, 23, 0);
    expect(bed.getDate()).toBe(16);
    expect(bed.getHours()).toBe(23);
  });

  it('rolls into tomorrow for a post-midnight bedtime', () => {
    // The case that made the old fixed-hour picker wrong: someone whose day ends
    // at 01:30 is going to bed tonight, not thirteen hours ago.
    const from = new Date(2026, 8, 16, 14, 0);
    const bed = bedtimeAfter(from, 1, 30);
    expect(bed.getDate()).toBe(17);
    expect(bed.getHours()).toBe(1);
    expect(bed.getTime()).toBeGreaterThan(from.getTime());
  });

  it('never resolves to an instant at or before the start', () => {
    const from = new Date(2026, 8, 16, 22, 0);
    expect(bedtimeAfter(from, 22, 0).getTime()).toBeGreaterThan(from.getTime());
    expect(bedtimeAfter(from, 21, 0).getTime()).toBeGreaterThan(from.getTime());
  });

  it('crosses a month boundary rather than producing the 32nd', () => {
    const from = new Date(2026, 8, 30, 23, 0);
    const bed = bedtimeAfter(from, 1, 0);
    expect(bed.getMonth()).toBe(9);
    expect(bed.getDate()).toBe(1);
  });
});

describe('averageTimeOfDay', () => {
  // Built from local Date parts, because the function reads local clock times —
  // a UTC literal here would test the harness's timezone, not the arithmetic.
  const at = (day: number, hour: number, minute: number) =>
    new Date(2026, 8, day, hour, minute).getTime();

  it('is the mean clock time, not the clock time of the mean instant', () => {
    // The bug this replaced: averaging the epochs of 08:00 Monday and 09:00
    // Tuesday lands at 20:30 Monday, which was never anyone's start time.
    expect(averageTimeOfDay([at(14, 8, 0), at(15, 9, 0)])).toEqual({ hour: 8, minute: 30 });
  });

  it('averages across midnight instead of through noon', () => {
    expect(averageTimeOfDay([at(14, 23, 0), at(15, 1, 0)])).toEqual({ hour: 0, minute: 0 });
  });

  it('holds a single reading exactly', () => {
    expect(averageTimeOfDay([at(16, 6, 45)])).toEqual({ hour: 6, minute: 45 });
  });

  it('has nothing to say about an empty history', () => {
    expect(averageTimeOfDay([])).toBeNull();
  });

  it('refuses to name a usual time when there is not one', () => {
    // Opposite sides of the clock: the mean is equally noon and midnight, so
    // printing either as "your usual start" would be a confident lie.
    expect(averageTimeOfDay([at(14, 6, 0), at(15, 18, 0)])).toBeNull();
  });
});

describe('logTimeAfterEdit', () => {
  it('means "now" when an editor seeded from the clock closes unchanged', () => {
    // The case that broke: the minute turned while the editor was open, so the
    // old code compared 12:00 against a clock reading 12:01 and pinned a time
    // the user never typed.
    expect(logTimeAfterEdit('12:00', '12:00', true)).toBeNull();
  });

  it('keeps a pin that was already set when the editor closes unchanged', () => {
    expect(logTimeAfterEdit('09:15', '09:15', false)).toBe('09:15');
  });

  it('takes the typed time whichever way the editor was seeded', () => {
    expect(logTimeAfterEdit('07:30', '12:00', true)).toBe('07:30');
    expect(logTimeAfterEdit('07:30', '09:15', false)).toBe('07:30');
  });

  it('falls back to now when nothing readable was typed', () => {
    expect(logTimeAfterEdit(null, '12:00', true)).toBeNull();
    expect(logTimeAfterEdit(null, '09:15', false)).toBeNull();
  });
});
