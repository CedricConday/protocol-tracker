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

/**
 * A stored SQLite timestamp ("YYYY-MM-DD HH:MM:SS", written by `datetime('now')`
 * and therefore UTC) as a local clock time.
 *
 * Lived in JournalScreen until 2026-09-17, when the History day sheet started
 * listing a day's several journal entries and needed the same reading. The `Z`
 * is the whole point: without it the string parses as local time and an entry
 * written at 21:00 UTC reads 21:00 in Berlin too, two hours out.
 */
export function formatStoredTime(stored: string): string {
  const parsed = new Date(`${stored.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  return formatClock(parsed);
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

/**
 * The usual time of day across a set of instants — the average of their local
 * clock times, not the clock time of their average instant.
 *
 * Added 2026-09-16, replacing `strftime('%H:%M', AVG(strftime('%s',
 * t0_timestamp)))` in `getAverageStartTime`, which was wrong twice over.
 * `t0_timestamp` is an integer millisecond epoch and SQLite reads a bare number
 * as a Julian day, so `strftime('%s', …)` was NULL for every row and the query
 * returned null every time it has ever been called — the morning reminder has
 * only ever used its "no usual time yet" copy. And averaging absolute epochs is
 * not an average time of day in the first place: 08:00 on Monday and 09:00 on
 * Tuesday average to 20:30 on Monday.
 *
 * Averaged on the circle, so times that straddle midnight behave — 23:00 and
 * 01:00 give midnight, not noon. Bedtime already established that a
 * post-midnight hour is ordinary here, not an outlier to clip.
 */
export function averageTimeOfDay(instants: number[]): { hour: number; minute: number } | null {
  if (instants.length === 0) return null;

  let x = 0;
  let y = 0;
  for (const ms of instants) {
    const d = new Date(ms);
    const angle = ((d.getHours() * 60 + d.getMinutes()) / 1440) * 2 * Math.PI;
    x += Math.cos(angle);
    y += Math.sin(angle);
  }

  // How tightly the times cluster: 1 is identical, 0 is no usual time at all.
  // Spread evenly enough around the clock and the mean is a coin toss — the
  // average of 06:00 and 18:00 is equally noon and midnight — so it returns
  // null rather than print either one as "your usual start".
  const clustering = Math.hypot(x, y) / instants.length;
  if (clustering < 0.3) return null;

  const minutes = ((Math.round((Math.atan2(y, x) / (2 * Math.PI)) * 1440) % 1440) + 1440) % 1440;
  return { hour: Math.floor(minutes / 60), minute: minutes % 60 };
}
