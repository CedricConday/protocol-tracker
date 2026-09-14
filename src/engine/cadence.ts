/**
 * Does a schedule rule produce a dose on a given day?
 *
 * Until this existed, every rule fired every day — `startDay` mapped the whole
 * rule set onto today unconditionally. That cannot express a weekday-only
 * supplement, a once-a-month injection, a protocol that pauses, or a dose that
 * is only taken when the patient needs it.
 *
 * The five frequencies are the set Dosage (GPL-3) arrived at after several
 * releases; the vocabulary is theirs, this implementation is not.
 *
 * Everything here is pure and takes a local `YYYY-MM-DD` string, never a Date
 * built from one — `new Date('2026-09-14')` parses as UTC midnight, which is
 * the previous day in every timezone west of Greenwich and the source of the
 * day-key drift protocol60 exists to catch.
 */
import type { ScheduleRule } from '../types';

export type Frequency = 'daily' | 'specific-days' | 'day-of-month' | 'cycle' | 'as-needed';

export const FREQUENCIES: Frequency[] = [
  'daily',
  'specific-days',
  'day-of-month',
  'cycle',
  'as-needed',
];

/** The cadence half of a rule. Kept separate so callers can pass a draft from
 *  the editor that is not yet a persisted ScheduleRule. */
export interface Cadence {
  frequency: string;
  /** Comma-separated JS weekday numbers, 0 = Sunday. Only read by 'specific-days'. */
  days_of_week: string;
  /** 1–31. Only read by 'day-of-month'. */
  day_of_month: number;
  /** Days on, then days off, counted from cycle_start_date. Only read by 'cycle'. */
  cycle_on_days: number;
  cycle_off_days: number;
  cycle_start_date: string;
}

/** Parse `YYYY-MM-DD` into a local-midnight Date. */
function localDate(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

/** Whole days from `from` to `to`, both local-midnight. Negative if `to` is earlier. */
function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function parseDaysOfWeek(csv: string): number[] {
  return csv
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

/**
 * True when the rule should produce a dose log on `dateStr`.
 *
 * Unknown or malformed cadence data falls back to firing. A rule that silently
 * stopped producing doses because a column held something unexpected would look
 * exactly like a patient who stopped taking it — the compliance history would
 * carry that lie forward and nothing would flag it. Failing loud is not an
 * option here (this runs inside startDay), so it fails *visible* instead.
 */
export function ruleFiresOn(rule: Cadence, dateStr: string): boolean {
  const date = localDate(dateStr);
  if (!date) return true;

  switch (rule.frequency) {
    case 'as-needed':
      // Never scheduled. The dose exists so it can be logged on demand and
      // counted in history, but it is not owed, so it cannot be missed and
      // must never enter a compliance denominator.
      return false;

    case 'specific-days': {
      const days = parseDaysOfWeek(rule.days_of_week);
      // No day selected is a half-finished rule, not "never" — fire it.
      return days.length === 0 || days.includes(date.getDay());
    }

    case 'day-of-month': {
      const want = rule.day_of_month;
      if (!Number.isInteger(want) || want < 1 || want > 31) return true;
      if (date.getDate() === want) return true;
      // A 31st rule would never fire in a 30-day month, and a 29th–31st rule
      // would skip February entirely. Land it on the last day instead of
      // dropping the dose.
      const lastOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      return want > lastOfMonth && date.getDate() === lastOfMonth;
    }

    case 'cycle': {
      const on = rule.cycle_on_days;
      const off = rule.cycle_off_days;
      if (!Number.isInteger(on) || on < 1) return true;
      if (!Number.isInteger(off) || off < 1) return true;
      const start = localDate(rule.cycle_start_date);
      if (!start) return true;
      const elapsed = daysBetween(start, date);
      // Before the cycle starts, nothing is owed yet.
      if (elapsed < 0) return false;
      return elapsed % (on + off) < on;
    }

    case 'daily':
    default:
      return true;
  }
}

/** One line for the editor and the rule list. */
export function describeCadence(rule: Cadence, t: (k: string) => string = (k) => k): string {
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  switch (rule.frequency) {
    case 'as-needed':
      return t('freqAsNeeded');
    case 'specific-days': {
      const days = parseDaysOfWeek(rule.days_of_week);
      if (days.length === 0) return t('freqDaily');
      if (days.length === 7) return t('freqDaily');
      return days
        .slice()
        .sort((a, b) => a - b)
        .map((d) => DAY_NAMES[d])
        .join(' · ');
    }
    case 'day-of-month':
      return `${t('freqDayOfMonth')} ${rule.day_of_month || 1}`;
    case 'cycle':
      return `${rule.cycle_on_days} ${t('freqOn')} · ${rule.cycle_off_days} ${t('freqOff')}`;
    case 'daily':
    default:
      return t('freqDaily');
  }
}

/** Cadence defaults for a new rule: every day, like every rule before this existed. */
export const DEFAULT_CADENCE: Cadence = {
  frequency: 'daily',
  days_of_week: '',
  day_of_month: 0,
  cycle_on_days: 0,
  cycle_off_days: 0,
  cycle_start_date: '',
};

/** Narrow a persisted rule down to just its cadence fields. */
export function cadenceOf(rule: Partial<ScheduleRule> & Partial<Cadence>): Cadence {
  return {
    frequency: rule.frequency ?? 'daily',
    days_of_week: rule.days_of_week ?? '',
    day_of_month: rule.day_of_month ?? 0,
    cycle_on_days: rule.cycle_on_days ?? 0,
    cycle_off_days: rule.cycle_off_days ?? 0,
    cycle_start_date: rule.cycle_start_date ?? '',
  };
}
