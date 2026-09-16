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

import { parseTimeOfDay, bedtimeAfter } from '../time';

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
