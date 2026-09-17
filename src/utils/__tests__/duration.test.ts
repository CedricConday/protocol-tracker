/**
 * Durations. "240" is four hours, and the patient entering pill #37 should
 * never have to know that. These tests pin both halves: the words we print and
 * the shapes we accept back.
 *
 * `../duration` reaches `../../i18n` for the locale and the strings, which
 * pulls in AsyncStorage, so both are mocked against the real English table —
 * a fake phrasebook would test the mock, not the copy.
 */

import { describe, it, expect, vi } from 'vitest';
import { en } from '../../i18n/en';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));

vi.mock('../../i18n', () => ({
  locale: () => 'en-GB',
  t: (key: string, params?: Record<string, string | number>) => {
    const raw = en[key] ?? key;
    return params
      ? raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
          Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole)
      : raw;
  },
}));

import { formatDuration, formatOffsetLabel, parseDuration, clockPreview } from '../duration';

describe('formatDuration', () => {
  it('says four hours, not two hundred and forty', () => {
    expect(formatDuration(240)).toBe('4 h');
  });

  it('splits the awkward ones', () => {
    expect(formatDuration(90)).toBe('1 h 30 min');
    expect(formatDuration(270)).toBe('4 h 30 min');
  });

  it('keeps short gaps in minutes', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(1)).toBe('1 min');
  });

  it('has a word for no gap at all', () => {
    expect(formatDuration(0)).toBe('right away');
  });

  it('treats a negative as the start of the day', () => {
    expect(formatDuration(-30)).toBe('right away');
  });

  it('rounds rather than printing a fraction of a minute', () => {
    expect(formatDuration(59.6)).toBe('1 h');
  });
});

describe('formatOffsetLabel', () => {
  it('replaces "T0 +240 min" with something a patient reads', () => {
    expect(formatOffsetLabel(240)).toBe('4 h after start');
  });

  it('names the anchor itself', () => {
    expect(formatOffsetLabel(0)).toBe('at start');
  });
});

describe('parseDuration', () => {
  it('takes a bare number as minutes, which is what the field always meant', () => {
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('0')).toBe(0);
  });

  it('takes the clock shape', () => {
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('4:00')).toBe(240);
    expect(parseDuration('1:5')).toBe(65);
  });

  it('takes hours however they are written', () => {
    expect(parseDuration('4h')).toBe(240);
    expect(parseDuration('4 h')).toBe(240);
    expect(parseDuration('4 hrs')).toBe(240);
    expect(parseDuration('4 hours')).toBe(240);
  });

  it('takes German, because half the users type it', () => {
    expect(parseDuration('4 Std')).toBe(240);
    expect(parseDuration('1 Stunde 30')).toBe(90);
    expect(parseDuration('45 Minuten')).toBe(45);
  });

  it('takes hours and minutes together', () => {
    expect(parseDuration('1h30')).toBe(90);
    expect(parseDuration('1 h 30 min')).toBe(90);
  });

  it('takes a decimal hour, comma or point', () => {
    expect(parseDuration('1.5h')).toBe(90);
    expect(parseDuration('1,5 h')).toBe(90);
  });

  it('takes minutes spelled out', () => {
    expect(parseDuration('45 min')).toBe(45);
    expect(parseDuration('45min')).toBe(45);
    expect(parseDuration('45 minutes')).toBe(45);
  });

  it('ignores case and surrounding space', () => {
    expect(parseDuration('  4 H  ')).toBe(240);
  });

  it('returns null rather than guessing', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('   ')).toBeNull();
    expect(parseDuration('soon')).toBeNull();
    expect(parseDuration('4 h later maybe')).toBeNull();
    expect(parseDuration('-30')).toBeNull();
  });

  it('refuses a value past the end of the day', () => {
    expect(parseDuration('25h')).toBeNull();
    expect(parseDuration('1441')).toBeNull();
    expect(parseDuration('1440')).toBe(1440);
  });

  it('round-trips everything formatDuration prints', () => {
    for (const minutes of [0, 1, 45, 59, 60, 90, 240, 270, 1439]) {
      const printed = formatDuration(minutes).replace('right away', '0');
      expect(parseDuration(printed)).toBe(minutes);
    }
  });
});

describe('clockPreview', () => {
  it('turns a gap into the hour it lands on', () => {
    expect(clockPreview(240, '07:00')).toBe('11:00');
  });

  it('carries past the hour', () => {
    expect(clockPreview(90, '07:45')).toBe('09:15');
  });

  it('shows nothing when there is no usual start time yet', () => {
    expect(clockPreview(240, null)).toBeNull();
    expect(clockPreview(240, 'whenever')).toBeNull();
  });

  it('wraps over midnight rather than printing an impossible hour', () => {
    expect(clockPreview(120, '23:30')).toBe('01:30');
  });
});
