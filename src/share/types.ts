/**
 * One share mechanism, for every button that puts data outside the app.
 *
 * Before 2026-09-17 there were four of them and no two agreed. The History
 * header shared the month in view as HTML; the button at the foot of the same
 * screen opened a PDF of the last 30 days; the Home banner shared a PDF of the
 * last 7, generated unprompted every Sunday; and Settings' "Export my data" was
 * an alert reading "to be implemented". Three hand-rolled renderers, four
 * hardcoded windows, and no way to say "the three months since I changed dose".
 *
 * Everything now goes through this: a range, a set of sections, a format. The
 * press only decides where the dials start.
 */

/** Presets, plus the custom range the sheet resolves to real dates. */
export type RangePreset = '7d' | '30d' | '3m' | 'all' | 'custom';

export type SectionKey =
  | 'doses'
  | 'journal'
  | 'journalNotes'
  | 'symptoms'
  | 'water'
  | 'sun'
  | 'exercise'
  | 'meals'
  | 'dayStart'
  | 'calcium'
  | 'labs'
  | 'mri';

export type ShareFormat = 'pdf' | 'json';

export interface ShareConfig {
  preset: RangePreset;
  /** Inclusive local day keys. Resolved from the preset before anything reads them. */
  from: string;
  to: string;
  sections: Record<SectionKey, boolean>;
  format: ShareFormat;
}

/**
 * What a section contributes to the sheet before anything is generated: its row
 * count for the CHOSEN range. An empty section is worth seeing in the dialog
 * rather than discovering as a blank heading in a document already sent.
 */
export type SectionCounts = Record<SectionKey, number>;

/**
 * Journal notes are their own section, not a property of the journal one.
 *
 * Cedric's call, and it is the right shape: "share my moods" and "share what I
 * wrote" are different disclosures. Someone logging a rough week may have
 * written something for themselves alone, and including it because they ticked
 * `journal` would be the app deciding that for them. It is off by default and
 * only selectable once `journal` is on.
 */
export const DEFAULT_SECTIONS: Record<SectionKey, boolean> = {
  doses: true,
  journal: true,
  journalNotes: false,
  symptoms: true,
  // Intake is protocol-critical on high-dose D3, so it defaults in.
  water: true,
  sun: true,
  exercise: false,
  meals: false,
  dayStart: false,
  // Shown only when rows exist; on when they do, since someone who has them
  // kept them for exactly this.
  calcium: true,
  labs: true,
  mri: true,
};

/** Sections with no writer left in the app — offered only when rows exist. */
export const LEGACY_SECTIONS: SectionKey[] = ['calcium', 'labs', 'mri'];

export const SECTION_ORDER: SectionKey[] = [
  'doses', 'journal', 'journalNotes', 'symptoms',
  'water', 'sun', 'exercise', 'meals', 'dayStart',
  'calcium', 'labs', 'mri',
];

/** i18n key per section, so the sheet and the document always agree on a name. */
export const SECTION_LABEL: Record<SectionKey, string> = {
  doses: 'shSecDoses',
  journal: 'shSecJournal',
  journalNotes: 'shSecJournalNotes',
  symptoms: 'shSecSymptoms',
  water: 'shSecWater',
  sun: 'shSecSun',
  exercise: 'shSecExercise',
  meals: 'shSecMeals',
  dayStart: 'shSecDayStart',
  calcium: 'shSecCalcium',
  labs: 'shSecLabs',
  mri: 'shSecMri',
};
