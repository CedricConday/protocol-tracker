/**
 * Quiet hours window logic.
 *
 * The pure functions only — getQuietWindow/isQuietAt read misc_flags through
 * queries.ts, which drags in react-native and will not parse here. What can actually be wrong here is
 * the arithmetic: a window that crosses midnight is the normal case, not the
 * edge case, and getting it backwards silences the whole day or nothing at all.
 */

import { describe, it, expect } from 'vitest';
import { parseHhMm, isInWindow } from '../quietWindow';

const at = (h: number, m = 0) => h * 60 + m;

describe('parseHhMm', () => {
  it('reads 24-hour times', () => {
    expect(parseHhMm('22:00')).toBe(1320);
    expect(parseHhMm('07:30')).toBe(450);
    expect(parseHhMm('0:00')).toBe(0);
  });

  it('rejects anything it cannot trust', () => {
    for (const bad of ['', '  ', '7', '7.30', '24:00', '22:60', '10pm', 'noon', null, undefined]) {
      expect(parseHhMm(bad as string)).toBeNull();
    }
  });
});

describe('isInWindow', () => {
  it('handles a window that crosses midnight', () => {
    const [start, end] = [at(22), at(7)];
    expect(isInWindow(at(23), start, end)).toBe(true);
    expect(isInWindow(at(3), start, end)).toBe(true);
    expect(isInWindow(at(22), start, end)).toBe(true);   // inclusive start
    expect(isInWindow(at(7), start, end)).toBe(false);   // exclusive end
    expect(isInWindow(at(12), start, end)).toBe(false);
    expect(isInWindow(at(21, 59), start, end)).toBe(false);
  });

  it('handles a same-day window', () => {
    const [start, end] = [at(13), at(14)];
    expect(isInWindow(at(13, 30), start, end)).toBe(true);
    expect(isInWindow(at(14), start, end)).toBe(false);
    expect(isInWindow(at(2), start, end)).toBe(false);
  });

  it('treats an empty window as no window, not as all day', () => {
    expect(isInWindow(at(3), at(22), at(22))).toBe(false);
    expect(isInWindow(at(22), at(22), at(22))).toBe(false);
  });
});
