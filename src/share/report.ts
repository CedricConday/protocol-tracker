import { t, locale } from '../i18n';
import type { ShareBundle } from './data';
import type { SectionKey } from './types';

/**
 * The one document builder.
 *
 * It replaces three: `ComplianceReport.ts` (30-day PDF), the inline HTML in
 * `CalendarScreen.handleShare` (the month in view) and the inline HTML in
 * `autoReport.ts` (the last week). They disagreed on range, on styling, on
 * which trackers existed, and two of the three were dark-on-black, which is a
 * choice for a screen and a waste of a doctor's toner.
 *
 * Every section states its own range in its heading. That is not decoration:
 * the old PDF put a 30-day compliance grid directly above a relapse table that
 * was `LIMIT 50` with no date filter at all, so a doctor read events from any
 * point in the patient's history as though they belonged to the month above.
 */

const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));

function fmtDate(dayKey: string): string {
  // Parsed at LOCAL midnight. `new Date('2026-09-16')` is UTC midnight, which
  // is the previous day everywhere west of Greenwich — the bug that used to
  // number every cell in the doctor's grid a day early for those users.
  return new Date(dayKey + 'T00:00:00').toLocaleDateString(locale(), {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function rangeLabel(from: string, to: string): string {
  return from === to ? fmtDate(from) : `${fmtDate(from)} — ${fmtDate(to)}`;
}

function complianceColor(pct: number, total: number): string {
  if (total === 0) return '#E9E9E4';
  if (pct >= 80) return '#2F8F5B';
  if (pct >= 50) return '#E9A23C';
  return '#C0392B';
}

function section(title: string, from: string, to: string, body: string): string {
  return `
    <h2 style="color:#14213D;font-size:15px;margin:26px 0 2px">${esc(title)}</h2>
    <p style="color:#7A8395;font-size:11px;margin:0 0 10px">${esc(rangeLabel(from, to))}</p>
    ${body}`;
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return `<p style="color:#7A8395;font-size:12px;margin:0">${esc(t('shNoRows'))}</p>`;
  }
  return `
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <tr>${headers.map((h) => `<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #14213D;color:#14213D">${esc(h)}</th>`).join('')}</tr>
      ${rows.map((r) => `<tr>${r.map((c) => `<td style="padding:6px 8px;border-bottom:1px solid #E4E4DE;color:#24324B">${esc(c)}</td>`).join('')}</tr>`).join('')}
    </table>`;
}

/**
 * The compliance grid, for any span.
 *
 * The old one hardcoded 30 cells in rows of 7 with no month labels, which is
 * legible for a month and meaningless for a year. This walks whole weeks from
 * the range's first day and prints a month label whenever one starts, so three
 * months reads as three months rather than as 13 anonymous rows.
 */
function complianceGrid(b: ShareBundle): string {
  const byDate = new Map(b.days.map((d) => [d.date, d]));
  const start = new Date(b.from + 'T00:00:00');
  const end = new Date(b.to + 'T00:00:00');
  // Back up to the week's Monday so columns line up under weekday headings.
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));

  const weekdayNames = (() => {
    const names: string[] = [];
    const d = new Date(2026, 8, 14); // a Monday
    for (let i = 0; i < 7; i++) {
      names.push(d.toLocaleDateString(locale(), { weekday: 'narrow' }));
      d.setDate(d.getDate() + 1);
    }
    return names;
  })();

  const rows: string[] = [];
  let lastMonth = '';
  while (cursor <= end) {
    const cells: string[] = [];
    let weekLabel = '';
    for (let i = 0; i < 7; i++) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      const inRange = key >= b.from && key <= b.to;
      const monthName = cursor.toLocaleDateString(locale(), { month: 'short', year: 'numeric' });
      if (inRange && monthName !== lastMonth) { lastMonth = monthName; weekLabel = monthName; }
      const day = byDate.get(key);
      const pct = day?.compliancePct ?? 0;
      const total = day?.totalDoses ?? 0;
      const bg = inRange ? complianceColor(pct, total) : '#FFFFFF';
      const fg = !inRange ? '#FFFFFF' : total === 0 ? '#9AA3B2' : '#FFFFFF';
      cells.push(`<td style="background:${bg};color:${fg};text-align:center;padding:5px;font-size:10px;font-weight:700;border-radius:3px">${inRange ? cursor.getDate() : ''}</td>`);
      cursor.setDate(cursor.getDate() + 1);
    }
    rows.push(`<tr><td style="font-size:10px;color:#7A8395;padding-right:6px;white-space:nowrap">${esc(weekLabel)}</td>${cells.join('')}</tr>`);
  }

  const totals = b.days.reduce(
    (acc, d) => ({ taken: acc.taken + d.takenDoses, total: acc.total + d.totalDoses }),
    { taken: 0, total: 0 },
  );
  const pct = totals.total > 0 ? Math.round((totals.taken / totals.total) * 100) : 0;

  return `
    <table style="border-collapse:separate;border-spacing:2px">
      <tr><td></td>${weekdayNames.map((w) => `<th style="font-size:9px;color:#7A8395;font-weight:600;padding-bottom:2px">${esc(w)}</th>`).join('')}</tr>
      ${rows.join('')}
    </table>
    <p style="font-size:12px;color:#24324B;margin-top:10px">
      ${esc(t('shDoseTotals', { taken: totals.taken, total: totals.total, pct }))}
    </p>`;
}

export function buildShareHtml(b: ShareBundle, sections: Record<SectionKey, boolean>): string {
  const on = (k: SectionKey) => sections[k];
  const parts: string[] = [];

  if (on('doses')) parts.push(section(t('shSecDoses'), b.from, b.to, complianceGrid(b)));

  if (on('journal')) {
    const headers = on('journalNotes')
      ? [t('date'), t('shTime'), t('shMood'), t('notes')]
      : [t('date'), t('shTime'), t('shMood')];
    const rows = b.journal.map((e) => {
      const time = e.created_at ? String(e.created_at).slice(11, 16) : '';
      return on('journalNotes')
        ? [fmtDate(e.date), time, e.mood, e.note || '—']
        : [fmtDate(e.date), time, e.mood];
    });
    parts.push(section(t('shSecJournal'), b.from, b.to, table(headers, rows)
      // Stated in the document, not only in the dialog: a doctor reading moods
      // with no text should know text was withheld rather than absent.
      + (on('journalNotes') ? '' : `<p style="color:#7A8395;font-size:11px;margin-top:6px">${esc(t('shNotesWithheld'))}</p>`)));
  }

  if (on('symptoms')) {
    parts.push(section(t('shSecSymptoms'), b.from, b.to, table(
      [t('date'), t('type'), t('severity'), t('notes')],
      b.symptoms.map((e) => [fmtDate(e.date), e.type, e.severity != null ? String(e.severity) : '—', e.notes || '—']),
    )));
  }

  if (on('water')) {
    const rows = b.anchors.filter((a) => a.water_ml > 0).map((a) => [fmtDate(a.date), `${a.water_ml} ml`]);
    parts.push(section(t('shSecWater'), b.from, b.to, table([t('date'), t('water')], rows)));
  }

  if (on('sun')) {
    const rows = b.sun.filter((s) => s.minutes > 0 || s.notes)
      .map((s) => [fmtDate(s.date), `${s.minutes} min`, s.uv_index || '—', s.notes || '—']);
    parts.push(section(t('shSecSun'), b.from, b.to, table([t('date'), t('shMinutes'), 'UV', t('notes')], rows)));
  }

  if (on('exercise')) {
    parts.push(section(t('shSecExercise'), b.from, b.to, table(
      [t('date'), t('shMinutes'), t('type')],
      b.exercise.map((e) => [fmtDate(e.date), `${e.duration_minutes} min`, e.type]),
    )));
  }

  if (on('meals')) {
    parts.push(section(t('shSecMeals'), b.from, b.to, table(
      [t('date'), t('shTime'), t('type'), t('notes')],
      b.meals.map((m) => [fmtDate(m.date), m.time || '—', m.meal_type, m.notes || '—']),
    )));
  }

  if (on('dayStart')) {
    const rows = b.anchors.filter((a) => a.t0_timestamp || a.first_meal_time).map((a) => [
      fmtDate(a.date),
      a.t0_timestamp ? new Date(a.t0_timestamp).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : '—',
      a.first_meal_time || '—',
    ]);
    parts.push(section(t('shSecDayStart'), b.from, b.to, table([t('date'), t('shDayStarted'), t('shFirstMeal')], rows)));
  }

  if (on('calcium') && b.calcium.length > 0) {
    parts.push(section(t('shSecCalcium'), b.from, b.to, table(
      [t('date'), t('shTestDay'), 'mg', t('notes')],
      b.calcium.map((c) => [fmtDate(c.test_start_date), String(c.day), String(c.calcium_mg), c.notes || '—']),
    )));
  }

  if (on('labs') && b.labs.length > 0) {
    parts.push(section(t('shSecLabs'), b.from, b.to, table(
      [t('date'), 'Vit D (ng/ml)', 'PTH (pg/ml)', 'Ca serum', 'Ca urine', t('notes')],
      b.labs.map((l) => [
        fmtDate(l.date), l.vit_d_ngml ?? '—', l.pth_pgml ?? '—',
        l.calcium_serum_mgdl ?? '—', l.calcium_urine_mg_g_cr ?? '—', l.notes || '—',
      ]),
    )));
  }

  if (on('mri') && b.mri.length > 0) {
    parts.push(section(t('shSecMri'), b.from, b.to, table(
      [t('date'), t('type'), t('shNewLesions'), t('shAssessment'), t('notes')],
      b.mri.map((m) => [
        fmtDate(m.date), m.scan_type || '—', m.new_lesions ?? '—',
        m.overall_assessment || '—', m.notes || '—',
      ]),
    )));
  }

  const header = `
    <h1 style="color:#1B58B8;font-size:20px;margin:0 0 2px">${esc(t('shDocTitle'))}</h1>
    <p style="color:#24324B;font-size:13px;margin:0">${esc(
      b.patientName
        ? t('shDocPatient', { name: b.patientName, dose: b.d3Dose || '—' })
        : t('shDocPatientAnon', { dose: b.d3Dose || '—' }),
    )}</p>
    <p style="color:#7A8395;font-size:12px;margin:2px 0 0">${esc(t('shDocRange', { range: rangeLabel(b.from, b.to) }))}</p>
    <p style="color:#7A8395;font-size:11px;margin:2px 0 0">${esc(t('shDocGenerated', {
      date: new Date().toLocaleDateString(locale(), { year: 'numeric', month: 'long', day: 'numeric' }),
    }))}</p>`;

  return `<!DOCTYPE html>
    <html><head><meta charset="utf-8"><style>
      body { font-family: -apple-system, system-ui, sans-serif; background:#FFFFFF; color:#24324B; padding:28px; margin:0; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
      h2 { page-break-after: avoid; }
    </style></head>
    <body>
      ${header}
      ${parts.join('\n')}
      <p style="color:#9AA3B2;font-size:10px;margin-top:32px;text-align:center">${esc(t('shDocFooter'))}</p>
    </body></html>`;
}
