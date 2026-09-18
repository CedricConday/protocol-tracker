import { t as translate } from '../i18n';

/**
 * Durations, in the words a patient would use.
 *
 * The timing field was a bare numeric box labelled "Minutes after first dose",
 * and the list row printed "T0 +240 min" back at them. 240 is four hours, but
 * nobody reads it that way before breakfast. Everything here exists to keep
 * hours and minutes in front of the patient while `offset_minutes` stays the
 * integer the scheduler wants.
 *
 * Parsing is deliberately as forgiving as `parseTimeOfDay` next door, and for
 * the same reason: the value is typed on a phone, and rejecting "1h30" teaches
 * nothing except that the field is fussy. It returns null rather than guess —
 * a wrong gap schedules a dose at the wrong hour.
 */

type T = typeof translate;

/** "right away" · "45 min" · "4 h" · "4 h 30 min" */
export function formatDuration(minutes: number, t: T = translate): string {
  const total = Math.max(0, Math.round(minutes));
  if (total === 0) return t('durRightAway');

  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return t('durMinutes', { min: m });
  if (m === 0) return t('durHours', { h });
  return t('durHoursMinutes', { h, min: m });
}

/**
 * What a stored offset means, said out loud: "at start" or "4 h after start".
 *
 * Replaces the hardcoded English `'At T0'` / `T0 +${n} min` on the editor row.
 * "T0" is the clinician's word for it; the patient's word is the moment they
 * tapped Start My Day.
 */
export function formatOffsetLabel(offsetMinutes: number, t: T = translate): string {
  const total = Math.max(0, Math.round(offsetMinutes));
  if (total === 0) return t('durAtStart');
  return t('durAfterStart', { duration: formatDuration(total, t) });
}

// Longest first, and closed with a not-a-letter lookahead rather than `\b`:
// "1h30" has no word boundary between the h and the 3, and that is exactly
// the shape people type when they are in a hurry.
const HOUR_WORD = String.raw`hours|hour|hrs|hr|stunden|stunde|std|h`;
const MIN_WORD = String.raw`minuten|minutes|minute|mins|min|m`;

/**
 * Accepts 90, 1:30, 1h30, "1 h 30", "4 h", "45 min", "1.5h", "1 Std 30".
 *
 * A bare number is minutes — that is what the field has always meant, and the
 * custom control offers separate h and min boxes anyway, so this path is the
 * forgiving fallback rather than the main road.
 */
export function parseDuration(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (s === '') return null;

  // 1:30 — an explicit separator is read before anything else, same order of
  // precedence as parseTimeOfDay, and for the same reason: "1:5" is one hour
  // five, not the digits "15".
  const colon = s.match(/^(\d{1,3})\s*:\s*(\d{1,2})$/);
  if (colon) return toMinutes(parseInt(colon[1], 10), parseInt(colon[2], 10));

  const hours = s.match(new RegExp(String.raw`^(\d{1,3}(?:[.,]\d+)?)\s*(?:${HOUR_WORD})(?![a-z])\s*(\d{1,3})?\s*(?:${MIN_WORD})?\.?$`));
  if (hours) {
    const h = parseFloat(hours[1].replace(',', '.'));
    const m = hours[2] ? parseInt(hours[2], 10) : 0;
    return toMinutes(h, m);
  }

  const mins = s.match(new RegExp(String.raw`^(\d{1,4})\s*(?:${MIN_WORD})\.?$`));
  if (mins) return toMinutes(0, parseInt(mins[1], 10));

  const bare = s.match(/^(\d{1,4})$/);
  if (bare) return toMinutes(0, parseInt(bare[1], 10));

  return null;
}

function toMinutes(hours: number, minutes: number): number | null {
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const total = Math.round(hours * 60 + minutes);
  // A day is the ceiling: the offset is measured inside one protocol day, and a
  // value past it is a typo, not a plan.
  if (total < 0 || total > 24 * 60) return null;
  return total;
}
