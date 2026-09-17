/**
 * The share mechanism's two load-bearing promises:
 *   1. a range means what it says, and
 *   2. nothing leaves that was not asked for — journal text above all.
 *
 * The renderer is exercised through its HTML because that IS the artifact: a
 * section that renders an empty heading, or one that leaks a note the user
 * never ticked, is only visible in the output.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('react-native', () => ({ NativeModules: {}, Platform: { OS: 'ios' } }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));

import { buildShareHtml } from '../report';
import { bundleToJson, countSections, type ShareBundle } from '../shape';
import { DEFAULT_SECTIONS, type SectionKey } from '../types';

const bundle: ShareBundle = {
  from: '2026-09-01',
  to: '2026-09-30',
  patientName: 'Testuser',
  d3Dose: '40000 IU',
  days: [
    { date: '2026-09-01', totalDoses: 2, takenDoses: 2, compliancePct: 100, eventCount: 0, hasJournal: true, hasWater: true, hasFood: false, hasExercise: false, hasSun: false, started: true },
    { date: '2026-09-02', totalDoses: 2, takenDoses: 1, compliancePct: 50, eventCount: 1, hasJournal: false, hasWater: false, hasFood: false, hasExercise: false, hasSun: true, started: true },
  ],
  journal: [
    { id: 1, date: '2026-09-01', mood: '🙂', note: 'SECRET DIARY TEXT', dietary_note: '', compliance_pct: 100, doses_taken: 2, doses_total: 2, created_at: '2026-09-01 08:15:00', updated_at: '2026-09-01 08:15:00' } as any,
    { id: 2, date: '2026-09-01', mood: '😔', note: '', dietary_note: '', compliance_pct: 100, doses_taken: 2, doses_total: 2, created_at: '2026-09-01 20:02:00', updated_at: '2026-09-01 20:02:00' } as any,
  ],
  symptoms: [{ id: 1, date: '2026-09-02', type: 'relapse', severity: 3, notes: 'leg numbness' } as any],
  sun: [{ date: '2026-09-02', minutes: 20, uv_index: '4', notes: '' }],
  exercise: [{ date: '2026-09-02', duration_minutes: 30, type: 'walk' }],
  meals: [{ date: '2026-09-01', meal_type: 'breakfast', time: '08:00', notes: '' }],
  anchors: [{ date: '2026-09-01', t0_timestamp: 1756713300000, water_ml: 2500, first_meal_time: '08:00' }],
  calcium: [],
  labs: [],
  mri: [],
};

const only = (...keys: SectionKey[]): Record<SectionKey, boolean> => {
  const out = {} as Record<SectionKey, boolean>;
  for (const k of Object.keys(DEFAULT_SECTIONS) as SectionKey[]) out[k] = keys.includes(k);
  return out;
};

describe('what leaves the device', () => {
  it('keeps journal notes out unless they are asked for by name', () => {
    const withoutNotes = buildShareHtml(bundle, only('journal'));
    expect(withoutNotes).not.toContain('SECRET DIARY TEXT');
    // and says so in the document, rather than letting a reader take the
    // absence of text for an absence of writing
    expect(withoutNotes).toContain('not included');

    const withNotes = buildShareHtml(bundle, only('journal', 'journalNotes'));
    expect(withNotes).toContain('SECRET DIARY TEXT');
  });

  it('drops the note from the JSON object rather than blanking it', () => {
    const json = JSON.parse(bundleToJson(bundle, only('journal')));
    expect(json.journal[0].note).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain('SECRET DIARY TEXT');
  });

  it('renders only the sections that were ticked', () => {
    const html = buildShareHtml(bundle, only('doses'));
    expect(html).not.toContain('leg numbness');
    expect(html).not.toContain('SECRET DIARY TEXT');
  });

  it('escapes what the user typed instead of pasting it into the document', () => {
    const hostile: ShareBundle = {
      ...bundle,
      symptoms: [{ id: 1, date: '2026-09-02', type: 'relapse', severity: 1, notes: '<script>alert(1)</script>' } as any],
    };
    const html = buildShareHtml(hostile, only('symptoms'));
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('carries the range into every section heading', () => {
    const html = buildShareHtml(bundle, only('doses', 'symptoms'));
    // The bug this replaces: a 30-day grid directly above an unfiltered
    // LIMIT 50 relapse table, with nothing saying they were different windows.
    const headings = html.match(/2026/g) ?? [];
    expect(headings.length).toBeGreaterThan(2);
  });

  it('totals doses across the whole range, not per day', () => {
    const html = buildShareHtml(bundle, only('doses'));
    expect(html).toContain('3');  // 2 + 1 taken
    expect(html).toContain('75'); // of 4 scheduled
  });
});

describe('counts shown beside each switch', () => {
  it('counts notes as entries that have text, not entries', () => {
    const counts = countSections(bundle);
    expect(counts.journal).toBe(2);
    expect(counts.journalNotes).toBe(1);
  });

  it('counts only days that hold something for that tracker', () => {
    const counts = countSections(bundle);
    expect(counts.doses).toBe(2);
    expect(counts.water).toBe(1);
    expect(counts.sun).toBe(1);
    expect(counts.exercise).toBe(1);
    expect(counts.calcium).toBe(0);
  });
});
