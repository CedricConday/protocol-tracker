import type { CalendarDay } from '../db/queries';
import type { JournalEntry, RelapseEvent } from '../types';
import type { SectionCounts, SectionKey } from './types';

/**
 * The shape of a share, and the two decisions made on it — with no database
 * behind them.
 *
 * Separated from `data.ts` so both can be tested without pulling `expo-sqlite`
 * (and with it the whole Expo runtime) into a node test. What is decided here
 * is what a doctor ends up reading, so it is the part that most needs tests.
 */
export interface ShareBundle {
  from: string;
  to: string;
  patientName: string;
  d3Dose: string;
  days: CalendarDay[];
  journal: JournalEntry[];
  symptoms: RelapseEvent[];
  sun: { date: string; minutes: number; uv_index: string | null; notes: string }[];
  exercise: { date: string; duration_minutes: number; type: string }[];
  meals: { date: string; meal_type: string; time: string; notes: string }[];
  anchors: { date: string; t0_timestamp: number | null; water_ml: number; first_meal_time: string | null }[];
  calcium: { test_start_date: string; day: number; calcium_mg: number; notes: string }[];
  labs: Record<string, any>[];
  mri: Record<string, any>[];
}


/** What each section would contribute, for the sheet to show beside its switch. */
export function countSections(b: ShareBundle): SectionCounts {
  const daysWithDoses = b.days.filter((d) => d.totalDoses > 0).length;
  return {
    doses: daysWithDoses,
    journal: b.journal.length,
    // The notes count is entries that actually HAVE text, not entries — the
    // number that answers "is there anything of mine in here".
    journalNotes: b.journal.filter((e) => (e.note ?? '').trim().length > 0).length,
    symptoms: b.symptoms.length,
    water: b.anchors.filter((a) => a.water_ml > 0).length,
    sun: b.sun.filter((s) => s.minutes > 0 || s.notes).length,
    exercise: b.exercise.length,
    meals: b.meals.length,
    dayStart: b.anchors.filter((a) => a.t0_timestamp || a.first_meal_time).length,
    calcium: b.calcium.length,
    labs: b.labs.length,
    mri: b.mri.length,
  };
}

/** The JSON form: the same range and the same sections, nothing extra. */
export function bundleToJson(b: ShareBundle, sections: Record<SectionKey, boolean>): string {
  const on = (k: SectionKey) => sections[k];
  const out: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    range: { from: b.from, to: b.to },
    patient: { name: b.patientName, d3Dose: b.d3Dose },
  };
  if (on('doses')) out.days = b.days;
  if (on('journal')) {
    out.journal = b.journal.map((e) => on('journalNotes')
      ? e
      // The text is dropped from the object, not blanked, so a reader cannot
      // mistake an empty string for "they wrote nothing".
      : { ...e, note: undefined, dietary_note: undefined });
  }
  if (on('symptoms')) out.symptoms = b.symptoms;
  if (on('water') || on('dayStart')) out.anchors = b.anchors;
  if (on('sun')) out.sun = b.sun;
  if (on('exercise')) out.exercise = b.exercise;
  if (on('meals')) out.meals = b.meals;
  if (on('calcium')) out.calcium = b.calcium;
  if (on('labs')) out.labs = b.labs;
  if (on('mri')) out.mri = b.mri;
  return JSON.stringify(out, null, 2);
}
