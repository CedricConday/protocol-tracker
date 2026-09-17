import {
  getCalendarRange, getJournalEntriesBetween, getRelapseEventsBetween,
  getSunBetween, getExerciseBetween, getMealsBetween, getAnchorsBetween,
  getCalciumBetween, getLabsBetween, getMriBetween, getEarliestDataDate,
  getProfile, getSupplementsWithRules, getWaterGoalMl, localDateStr, todayStr,
  type CalendarDay,
} from '../db/queries';
import type { RangePreset } from './types';
import type { ShareBundle } from './shape';

export { countSections, bundleToJson } from './shape';
export type { ShareBundle } from './shape';


/** `n` days back from today, inclusive of today, as a local day key. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateStr(d);
}

/**
 * A preset as real dates.
 *
 * `all` asks the tables where the data starts rather than assuming the profile
 * date — anyone who seeded history or came across from the PWA has rows older
 * than their profile. An empty install collapses to today, which yields an
 * honest empty document instead of a range starting at the epoch.
 */
export async function resolveRange(preset: RangePreset, custom?: { from: string; to: string }): Promise<{ from: string; to: string }> {
  const to = todayStr();
  switch (preset) {
    case '7d': return { from: daysAgo(6), to };
    case '30d': return { from: daysAgo(29), to };
    case '3m': return { from: daysAgo(89), to };
    case 'all': return { from: (await getEarliestDataDate()) ?? to, to };
    case 'custom': return { from: custom?.from ?? daysAgo(29), to: custom?.to ?? to };
  }
}

/**
 * Everything the chosen range holds, whether or not a section is switched on.
 *
 * Deliberately unfiltered by section: the sheet needs the counts to show what a
 * section would contribute BEFORE it is ticked, and the document then renders
 * only what was asked for. One pass, ~10 grouped queries, whatever the span.
 */
export async function collectShareData(from: string, to: string): Promise<ShareBundle> {
  const [
    dayMap, journal, symptoms, sun, exercise, meals, anchors, calcium, labs, mri, profile, supplements,
    waterGoalMl,
  ] = await Promise.all([
    getCalendarRange(from, to),
    getJournalEntriesBetween(from, to),
    getRelapseEventsBetween(from, to),
    getSunBetween(from, to),
    getExerciseBetween(from, to),
    getMealsBetween(from, to),
    getAnchorsBetween(from, to),
    getCalciumBetween(from, to),
    getLabsBetween(from, to),
    getMriBetween(from, to),
    getProfile(),
    getSupplementsWithRules(),
    getWaterGoalMl(),
  ]);

  // No 'vit_d3' id exists in this build — the user names their own supplements
  // — so the D3 entry is matched by name, as ReportScreen has always done.
  const d3 = supplements.find((r: any) => /(^|\W)(d3|vitamin\s*d)/i.test(r.name));

  return {
    from,
    to,
    patientName: profile?.name ?? '',
    d3Dose: d3?.dose_amount ?? '',
    supplements,
    waterGoalMl,
    days: Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    journal, symptoms, sun, exercise, meals, anchors, calcium, labs, mri,
  };
}

