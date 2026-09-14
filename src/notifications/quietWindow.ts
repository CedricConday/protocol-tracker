/**
 * Quiet-hours arithmetic — no imports on purpose.
 *
 * Split out of quietHours.ts so it is testable: that module reaches misc_flags
 * through queries.ts, which drags in react-native and cannot be parsed by the
 * unit-test runner. The logic worth pinning is here; the I/O stays there.
 */

/** "22:00" -> 1320 minutes past local midnight. null if unparseable. */
export function parseHhMm(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Is `minutes` inside [start, end)? The window normally crosses midnight
 * (22:00 -> 07:00), so the wrapped case is the common one, not the exception.
 * start === end is treated as "no window" rather than "silence all day".
 */
export function isInWindow(minutes: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end;
}
