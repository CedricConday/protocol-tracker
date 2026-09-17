/**
 * Locale parity.
 *
 * The failure mode this guards against is invisible in development: an English
 * key added without its German twin falls back to English at runtime, so the
 * app looks fine to anyone testing in English and is half-translated for the
 * person who actually needs the translation. Same for a placeholder renamed on
 * one side — `{name}` printed literally in the middle of a German sentence.
 */

import { describe, it, expect } from 'vitest';
import { en } from '../en';
import { de } from '../de';

const placeholders = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();

describe('en/de parity', () => {
  it('has the same keys on both sides', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it('uses the same placeholders in every shared key', () => {
    const mismatched = Object.keys(en)
      .filter((k) => k in de)
      .filter((k) => JSON.stringify(placeholders(en[k])) !== JSON.stringify(placeholders(de[k])));
    expect(mismatched).toEqual([]);
  });

  it('has no empty strings', () => {
    for (const [name, table] of [['en', en], ['de', de]] as const) {
      const empty = Object.entries(table).filter(([, v]) => !String(v).trim());
      expect(empty, `${name} has empty values`).toEqual([]);
    }
  });

  it('leaves only the known handful identical in both languages', () => {
    // A German value identical to the English one is usually a forgotten
    // translation. These are genuine: a version line that is all numbers and
    // punctuation, words German borrowed or spells the same way, a name used
    // as a placeholder, a pure composition of other translated parts, and two
    // lines that are only a label plus an interpolated value.
    const allowed = new Set([
      'setVersionLine', 'obOptional', 'sumExerciseKind',
      'patientFallback',      // Patient
      'mealSnack',            // Snack
      'evSymptom',            // Symptom
      'moodOkay',             // Okay
      'setNamePlaceholder',   // Alex — a first name, not a word
      'doseStatusLine',       // "Status: {status}"
      'labSulkowitchA11y',    // "Sulkowitch: {value}" — a test's proper name
      // Share sheet, 2026-09-17:
      'shFormat',             // Format — same word, same spelling
      'shFormatJson',         // JSON
      'shDialogTitle',        // Protocol Tracker — the product name
      'shSecJournal',         // Journal — German uses it unchanged
      // Supplement form bubbles, 2026-09-17:
      'fieldForm',            // Form — the dosage form, same word in German
    ]);
    const identical = Object.keys(en).filter(
      (k) => k in de && en[k] === de[k] && String(en[k]).trim().length > 3 && !allowed.has(k),
    );
    expect(identical).toEqual([]);
  });
});
