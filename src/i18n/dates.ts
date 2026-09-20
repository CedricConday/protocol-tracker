import { locale } from './index';

/**
 * Weekday names, from Intl rather than a hardcoded array.
 *
 * Seven files each carried their own `['Mon','Tue',…]`, three of them starting
 * on Sunday and four on Monday — so translating them meant seven edits and
 * getting the offset right seven times. Intl already knows both the names and
 * the abbreviation style for the locale ("Mo." in German, not "Mon").
 *
 * Cached per locale: `Intl.DateTimeFormat` is not free and these are read
 * inside render paths that run on every focus.
 */

const cache = new Map<string, string[]>();

/** Seven short weekday names, index 0 = Monday. */
export function weekdaysShort(): string[] {
  const key = locale();
  const hit = cache.get(key);
  if (hit) return hit;

  const fmt = new Intl.DateTimeFormat(key, { weekday: 'short' });
  // 2024-01-01 was a Monday; the year is arbitrary and never shown.
  const names = Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)));
  cache.set(key, names);
  return names;
}

/** Seven short weekday names, index 0 = Sunday — for `Date.getDay()`. */
export function weekdaysShortSundayFirst(): string[] {
  const mondayFirst = weekdaysShort();
  return [mondayFirst[6], ...mondayFirst.slice(0, 6)];
}

/** The short name for a Date, whatever the locale's week start. */
export function weekdayShortFor(date: Date): string {
  return weekdaysShortSundayFirst()[date.getDay()];
}

const clockCache = new Map<string, Intl.DateTimeFormat>();

/**
 * A clock time split into the number and the day period, if the locale has one.
 *
 * `DoseRow` draws the hour large and "AM"/"PM" small underneath it, so it cannot
 * take a single formatted string — but it also cannot keep computing the period
 * itself, which is what it did: `hour >= 12 ? 'PM' : 'AM'` regardless of locale,
 * under a German UI that writes 14:30 and has no such word. Intl decides both
 * the clock and whether there is a period at all; `dayPeriod` is null on a
 * 24-hour locale and the caller draws nothing.
 */
export function clockParts(d: Date): { time: string; dayPeriod: string | null } {
  const key = locale();
  let fmt = clockCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(key, { hour: 'numeric', minute: '2-digit' });
    clockCache.set(key, fmt);
  }

  const parts = fmt.formatToParts(d);
  const dayPeriod = parts.find((p) => p.type === 'dayPeriod')?.value ?? null;
  const time = parts
    .filter((p) => p.type !== 'dayPeriod')
    .map((p) => p.value)
    .join('')
    .trim();

  return { time, dayPeriod };
}

const monthCache = new Map<string, string[]>();

/** Twelve month names, index 0 = January. */
export function monthNames(style: 'long' | 'short' = 'long'): string[] {
  const key = `${locale()}:${style}`;
  const hit = monthCache.get(key);
  if (hit) return hit;
  const fmt = new Intl.DateTimeFormat(locale(), { month: style });
  const names = Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2024, i, 1)));
  monthCache.set(key, names);
  return names;
}

/** A full date the way the locale writes it: "14 September 2026" / "14. September 2026". */
export function longDate(d: Date): string {
  return d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Day and month only: "14 Sep" / "14. Sep." */
export function shortDate(d: Date): string {
  return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
}
