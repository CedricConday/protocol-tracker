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
  if (total === 0) return '#E9EFF6';
  if (pct >= 80) return '#227D4C';
  if (pct >= 50) return '#E9A23C';
  return '#C0392B';
}

function section(title: string, from: string, to: string, body: string): string {
  return `
    <h2 style="color:#112438;font-size:15px;margin:26px 0 2px">${esc(title)}</h2>
    <p style="color:#495D72;font-size:11px;margin:0 0 10px">${esc(rangeLabel(from, to))}</p>
    ${body}`;
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return `<p style="color:#495D72;font-size:12px;margin:0">${esc(t('shNoRows'))}</p>`;
  }
  return `
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <tr>${headers.map((h) => `<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #112438;color:#112438">${esc(h)}</th>`).join('')}</tr>
      ${rows.map((r) => `<tr>${r.map((c) => `<td style="padding:6px 8px;border-bottom:1px solid #E9EFF6;color:#24324B">${esc(c)}</td>`).join('')}</tr>`).join('')}
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
const legendSwatch = (color: string): string =>
  `<span style="display:inline-block;width:8px;height:8px;background:${color};border:1px solid #D8E1EA;border-radius:2px;margin:0 3px 0 10px"></span>`;

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
      // Out-of-range days are drawn, muted, rather than left blank. Blank cells
      // at the start and end of a range read as a calendar that was cut off —
      // the range begins mid-week, and a doctor cannot tell a day the patient
      // did not record from a day the report did not cover.
      const bg = inRange ? complianceColor(pct, total) : '#FBFCFE';
      const fg = !inRange ? '#C2CBD6' : total === 0 ? '#617285' : '#FFFFFF';
      const weight = inRange ? '700' : '400';
      cells.push(`<td style="background:${bg};color:${fg};text-align:center;padding:5px;font-size:10px;font-weight:${weight};border-radius:3px">${cursor.getDate()}</td>`);
      cursor.setDate(cursor.getDate() + 1);
    }
    rows.push(`<tr><td style="font-size:10px;color:#495D72;padding-right:6px;white-space:nowrap">${esc(weekLabel)}</td>${cells.join('')}</tr>`);
  }

  const totals = b.days.reduce(
    (acc, d) => ({ taken: acc.taken + d.takenDoses, total: acc.total + d.totalDoses }),
    { taken: 0, total: 0 },
  );
  const pct = totals.total > 0 ? Math.round((totals.taken / totals.total) * 100) : 0;

  return `
    <table style="border-collapse:separate;border-spacing:2px">
      <tr><td></td>${weekdayNames.map((w) => `<th style="font-size:9px;color:#495D72;font-weight:600;padding-bottom:2px">${esc(w)}</th>`).join('')}</tr>
      ${rows.join('')}
    </table>
    <p style="font-size:12px;color:#24324B;margin-top:10px">
      ${esc(t('shDoseTotals', { taken: totals.taken, total: totals.total, pct }))}
    </p>
    <p style="font-size:10px;color:#495D72;margin:4px 0 0">
      ${legendSwatch('#227D4C')} ${esc(t('shLegendHigh'))}
      ${legendSwatch('#E9A23C')} ${esc(t('shLegendMid'))}
      ${legendSwatch('#C0392B')} ${esc(t('shLegendLow'))}
      ${legendSwatch('#E9EFF6')} ${esc(t('shLegendNone'))}
      ${legendSwatch('#FBFCFE')} ${esc(t('shLegendOutside'))}
    </p>`;
}

/** Mean of a list of numbers, rounded. Empty list means no value, not zero. */
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, v) => a + v, 0) / values.length);
}

const num = (v: number): string => v.toLocaleString(locale());

/**
 * Which of the medication plan's four columns a scheduled dose falls in.
 *
 * The app schedules by offset from T0 — the moment the patient starts their day
 * — not by clock time, so there is no "08:00" to read. Bucketing the offset is
 * the honest translation: a dose four hours after waking is a midday dose to
 * everyone who reads a Medikationsplan, whatever the clock said.
 */
function doseColumn(offsetMinutes: number): 0 | 1 | 2 | 3 {
  const h = offsetMinutes / 60;
  if (h < 4) return 0;
  if (h < 8) return 1;
  if (h < 13) return 2;
  return 3;
}

/**
 * The protocol, in the column order of the bundeseinheitlicher Medikationsplan
 * (§31a SGB V): substance, strength, unit, form, the four dose columns, note,
 * reason. German patients and doctors already read this table; matching it costs
 * nothing and means the page needs no explaining.
 *
 * "Reason" stays empty because the app does not ask for one. An indication
 * invented by the exporter would be the one line on the page a doctor would act
 * on and nobody wrote.
 */
function protocolTable(b: ShareBundle): string {
  const rows = new Map<string, { form: string; dose: string; unit: string; cols: number[]; note: string }>();
  for (const sup of b.supplements) {
    const key = `${sup.name}|${sup.dose_amount}${sup.dose_unit}`;
    const row = rows.get(key) ?? {
      form: sup.form ?? '',
      dose: sup.dose_amount ?? '',
      unit: sup.dose_unit ?? '',
      cols: [0, 0, 0, 0],
      note: sup.with_food ? t('shWithFood') : '',
    };
    row.cols[doseColumn(sup.offset_minutes ?? 0)] += 1;
    rows.set(key, row);
  }

  const cells = [...rows.entries()].map(([key, r]) => {
    const name = key.split('|')[0];
    return [
      name, r.dose || '—', r.unit || '—', r.form || '—',
      ...r.cols.map((n) => (n ? String(n) : '—')),
      r.note || '—', '—',
    ];
  });

  return table(
    [t('shColSubstance'), t('shColStrength'), t('shColUnit'), t('shColForm'),
      t('shColMorning'), t('shColNoon'), t('shColEvening'), t('shColNight'),
      t('shColNote'), t('shColReason')],
    cells,
  );
}

/** One tile of the strip a clinician reads before reading anything else. */
function kpi(label: string, value: string, note: string, bad: boolean): string {
  return `
    <td style="width:25%;border:1px solid #E1E8F0;border-top:3px solid ${bad ? '#C0392B' : '#1B4F9C'};border-radius:5px;padding:9px 10px;vertical-align:top">
      <div style="font-size:9px;letter-spacing:.06em;color:#495D72;text-transform:uppercase">${esc(label)}</div>
      <div style="font-size:20px;font-weight:800;margin:2px 0 1px;color:#112438">${esc(value)}</div>
      <div style="font-size:10px;color:${bad ? '#C0392B' : '#495D72'}">${esc(note)}</div>
    </td>`;
}

export function buildShareHtml(b: ShareBundle, sections: Record<SectionKey, boolean>): string {
  const on = (k: SectionKey) => sections[k];
  const parts: string[] = [];

  const doses = b.days.reduce(
    (acc, d) => ({ taken: acc.taken + d.takenDoses, total: acc.total + d.totalDoses }),
    { taken: 0, total: 0 },
  );
  const pdc = doses.total > 0 ? Math.round((doses.taken / doses.total) * 100) : 0;
  // Calendar days in the range, not rows returned — `days` only holds days the
  // app wrote something for, so rows/rows would always read 29/29 and say
  // nothing about how much of the period was actually captured.
  const daysInRange = Math.round(
    (new Date(b.to + 'T00:00:00').getTime() - new Date(b.from + 'T00:00:00').getTime()) / 86400000,
  ) + 1;
  const daysWithData = b.days.filter((d) => d.started || d.totalDoses > 0).length;
  const watered = b.anchors.filter((a) => a.water_ml > 0);
  const waterAvg = mean(watered.map((a) => a.water_ml));
  const waterShort = waterAvg != null && waterAvg < b.waterGoalMl;

  // ── the strip ──────────────────────────────────────────────────────────────
  const tiles: string[] = [];
  if (on('doses')) {
    tiles.push(kpi(t('shKpiAdherence'), `${pdc}%`,
      pdc >= 80 ? t('shKpiTargetMet') : t('shKpiTargetBelow'), pdc < 80));
    tiles.push(kpi(t('shKpiCapture'), `${daysWithData}/${daysInRange}`, t('shKpiDaysWithData'), false));
  }
  if (on('water')) {
    tiles.push(kpi(t('shKpiWater'),
      waterAvg == null ? '—' : `${(waterAvg / 1000).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} l`,
      t('shKpiWaterTarget', { goal: (b.waterGoalMl / 1000).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }),
      waterShort));
  }
  if (on('symptoms')) {
    tiles.push(kpi(t('shKpiEvents'), String(b.symptoms.length), t('shKpiRelapses'), b.symptoms.length > 0));
  }
  if (tiles.length > 0) {
    parts.push(`<table style="width:100%;border-collapse:separate;border-spacing:7px 0;margin-top:12px"><tr>${tiles.join('')}</tr></table>`);
  }

  // ── 1 · the protocol ───────────────────────────────────────────────────────
  if (b.supplements.length > 0) {
    parts.push(section(t('shSecProtocol'), b.from, b.to, protocolTable(b)));
  }

  // ── 2 · adherence ──────────────────────────────────────────────────────────
  if (on('doses')) parts.push(section(t('shSecDoses'), b.from, b.to, complianceGrid(b)));

  // ── 3 · everything else, as measures rather than as a log ──────────────────
  const measures: string[][] = [];
  if (on('water')) {
    measures.push([t('shSecWater'), waterAvg == null ? '—' : t('shPerDay', { v: `${num(waterAvg)} ml` }), String(watered.length),
      t('shTargetWater', { goal: num(b.waterGoalMl) }) + (waterShort ? ` — ${t('shBelowTarget')}` : '')]);
  }
  if (on('sun')) {
    const logged = b.sun.filter((x) => x.minutes > 0);
    const avg = mean(logged.map((x) => x.minutes));
    measures.push([t('shSecSun'), avg == null ? '—' : t('shPerDay', { v: `${avg} min` }), String(logged.length), '—']);
  }
  if (on('exercise')) {
    const total = b.exercise.reduce((acc, e) => acc + e.duration_minutes, 0);
    measures.push([t('shSecExercise'), t('shTotalOf', { v: `${num(total)} min` }), String(b.exercise.length), '—']);
  }
  if (on('meals')) {
    measures.push([t('shSecMeals'), String(b.meals.length), String(new Set(b.meals.map((m) => m.date)).size), '—']);
  }
  if (on('journal')) {
    const byMood = new Map<string, number>();
    for (const e of b.journal) if (e.mood) byMood.set(e.mood, (byMood.get(e.mood) ?? 0) + 1);
    const moods = [...byMood.entries()].sort((a, c) => c[1] - a[1]).map(([m, n]) => `${m} ${n}`).join('  ');
    measures.push([t('shSecJournal'), moods || '—', String(new Set(b.journal.map((e) => e.date)).size),
      on('journalNotes') ? '—' : t('shNotesWithheld')]);
  }
  if (on('dayStart')) {
    const starts = b.anchors.filter((a) => a.t0_timestamp).map((a) => {
      const d = new Date(a.t0_timestamp as number);
      return d.getHours() * 60 + d.getMinutes();
    });
    const avg = mean(starts);
    const clock = avg == null ? '—'
      : new Date(2026, 0, 1, Math.floor(avg / 60), avg % 60).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
    measures.push([t('shSecDayStart'), clock === '—' ? clock : t('shAverageOf', { v: clock }), String(starts.length), '—']);
  }
  if (on('symptoms')) {
    measures.push([t('shSecSymptoms'), String(b.symptoms.length), '—', '—']);
  }
  if (measures.length > 0) {
    parts.push(section(t('shSecMeasures'), b.from, b.to,
      table([t('shColMeasure'), t('shColValue'), t('shColDays'), t('shColTarget')], measures)));
  }

  // Events themselves are few and clinical — they keep their rows.
  if (on('symptoms') && b.symptoms.length > 0) {
    parts.push(section(t('shSecSymptoms'), b.from, b.to, table(
      [t('date'), t('type'), t('severity'), t('notes')],
      b.symptoms.map((e) => [fmtDate(e.date), e.type, e.severity != null ? String(e.severity) : '—', e.notes || '—']),
    )));
  }

  // The one part of the journal that is not a number, and only on request.
  if (on('journal') && on('journalNotes')) {
    const rows = b.journal
      .filter((e) => (e.note ?? '').trim().length > 0)
      .map((e) => [fmtDate(e.date), e.mood ?? '', (e.note ?? '').trim()]);
    parts.push(section(t('shSecJournalNotes'), b.from, b.to, table([t('date'), t('shMood'), t('notes')], rows)));
  }

  // Legacy clinical tables: no screen writes these any more, but anyone with
  // rows from an older install can still put them in front of a doctor.
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
    <div style="border-left:4px solid #1B4F9C;padding-left:12px">
    <h1 style="color:#112438;font-size:20px;margin:0 0 2px">${esc(t('shDocTitle'))}</h1>
    <p style="color:#24324B;font-size:13px;margin:0">${esc(
      b.patientName
        ? t('shDocPatient', { name: b.patientName, dose: b.d3Dose || '—' })
        : t('shDocPatientAnon', { dose: b.d3Dose || '—' }),
    )}</p>
    <p style="color:#495D72;font-size:12px;margin:2px 0 0">${esc(t('shDocRange', { range: rangeLabel(b.from, b.to) }))}</p>
    <p style="color:#495D72;font-size:11px;margin:2px 0 0">${esc(t('shDocGenerated', {
      date: new Date().toLocaleDateString(locale(), { year: 'numeric', month: 'long', day: 'numeric' }),
    }))}</p>
    <p style="color:#617285;font-size:10.5px;margin:3px 0 0">${esc(t('shDocProvenance'))}</p>
    </div>`;

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
      <p style="color:#617285;font-size:10px;margin-top:32px;text-align:center">${esc(t('shDocFooter'))}</p>
    </body></html>`;
}
