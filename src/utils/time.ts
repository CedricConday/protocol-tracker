import { locale } from '../i18n';

/**
 * Times of day, parsed and formatted in one place.
 *
 * Extracted from FoodScreen on 2026-09-16 when Bedtime needed the same forgiving
 * input. Two screens each rolling their own parser is how one of them ends up
 * accepting "7 30 pm" while the other silently discards it.
 *
 * The parser returns numbers and the formatter turns numbers into text, kept
 * separate because they have different callers: Food stores a formatted string
 * in `daily_anchors.first_meal_time`, Bedtime stores `bedtime_hour` and
 * `bedtime_minute` as integers on the profile.
 */

/**
 * Accepts 7:5, 07:05, 0705, 7.05, "4 30 pm", "11 pm" — anything that resolves
 * to a real time of day.
 *
 * Returns null rather than guessing. A wrong bedtime silently schedules doses
 * against the wrong boundary, and a wrong first-meal time is worse than an
 * unchanged one, so both callers treat null as "leave what is stored alone".
 */
export function parseTimeOfDay(raw: string): { hour: number; minute: number } | null {
  const pm = /p\.?m/i.test(raw);
  const am = /a\.?m/i.test(raw);
  let hour: number;
  let minute: number;

  // An explicit separator is read before falling back to digit counting.
  // Stripping separators first — which this did until 2026-09-16 — turned "7:5"
  // into the two digits "75", so a single-digit minute was rejected as hour 75
  // even though the contract above promised to take it.
  const separated = raw.match(/(\d{1,2})\s*[:.\s]\s*(\d{1,2})/);
  if (separated) {
    hour = parseInt(separated[1], 10);
    minute = parseInt(separated[2], 10);
  } else {
    const digits = raw.replace(/[^0-9]/g, '');
    if (digits.length === 3) { hour = parseInt(digits.slice(0, 1), 10); minute = parseInt(digits.slice(1), 10); }
    else if (digits.length === 4) { hour = parseInt(digits.slice(0, 2), 10); minute = parseInt(digits.slice(2), 10); }
    else if (digits.length <= 2 && digits.length > 0) { hour = parseInt(digits, 10); minute = 0; }
    else return null;
  }
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return null;
  if (pm && hour < 12) hour += 12;
  if (am && hour === 12) hour = 0;
  if (hour > 23) return null;
  return { hour, minute };
}

/** The one formatter, so a column never holds "04:27 PM" on one day and "16:27" on the next. */
export function formatClock(d: Date): string {
  return d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
}

export function formatHourMinute(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return formatClock(d);
}

export function clockNow(): string {
  return formatClock(new Date());
}

/**
 * The instant a given bedtime next falls, at or after `from`.
 *
 * This is what lets bedtime be any time of day rather than the old 18:00–23:45
 * picker. A bedtime of 01:30 is not "earlier in the day than now" — it is
 * tonight, after midnight — so the date rolls forward whenever the wall-clock
 * time has already passed. Without this, a post-midnight bedtime resolves to an
 * instant in the past and every dose looks late.
 */
export function bedtimeAfter(from: Date, hour: number, minute: number): Date {
  const bed = new Date(from);
  bed.setHours(hour, minute, 0, 0);
  if (bed.getTime() <= from.getTime()) bed.setDate(bed.getDate() + 1);
  return bed;
}
