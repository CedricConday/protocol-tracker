// protocol60.mjs — one headless pass that simulates a NEW patient running the
// full high-dose D3 protocol for 60 days, and audits every screen it touches.
//
// Derived from thirtyday.mjs. Same machinery; three differences: 60 days instead
// of 30, a fresh synthetic patient rather than the 30-day fixture, and the
// protocol's clinical milestones — baseline/mid/end lab panels, two MRI entries,
// the co-supplement set, and the doctor report — driven on the days a real
// patient would hit them.
//
// Why this exists: the per-flow harness in e2e/run.mjs starts each flow from a
// fresh install, so it only ever sees day one. Bugs that need history — streaks,
// weekly charts, adherence over a window, day-key drift — are invisible to it.
// This script keeps ONE browser context alive across 30 simulated days so the
// database accumulates the way a real user's would.
//
// After the forward pass, a second phase walks BACKWARD through that same real
// history using the History tab's own day-detail stepper (CalendarScreen.tsx
// stepDay), cross-checking what the UI renders against the SQLite truth via the
// read-only sql() bridge — then walks FORWARD again back to today and confirms
// the "no future days" boundary holds. Forward accumulates the data; backward
// (and back-forward) proves the app can still read its own history correctly.
//
//   node e2e/thirtyday.mjs            # full 30-day run
//   node e2e/thirtyday.mjs --days 5   # short run while iterating on the script
//
// THE CLOCK SEAM. The app has no date provider: 72 separate `new Date()` /
// `Date.now()` calls read the system clock directly (see the audit). Rather than
// add a dev-only override to source — an audit must not edit the code it audits
// — this drives Playwright's `clock.setFixedTime`, which replaces Date/Date.now
// in the page while leaving setTimeout/rAF real, so the app's own logic runs
// untouched and animations still settle. Time moves in jumps *within* a day too
// (morning -> midday -> evening), which is what makes dose windows testable.
//
// Data is never hand-inserted: every row in the export was written by the app's
// own code paths, driven through the UI.
import { chromium } from '/home/ubuntu/.npm/_npx/705bc6b22212b352/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE_URL = process.env.PT_E2E_URL || 'http://localhost:8085';
const OUT = process.env.PT_OUT || 'e2e/report/protocol60';
const SHOTS = join(OUT, 'shots');
const START = '2026-07-01';
const TOTAL_DAYS = Number(process.env.PT_DAYS || process.argv[process.argv.indexOf('--days') + 1]) || 60;

// Web-only noise from native modules that have no web implementation. These say
// nothing about device behaviour, so they must not drown the real findings.
const NOISE = [
  /not (yet )?(fully )?(available|supported) on web/i,
  /React DevTools/i,
  /useNativeDriver/i,
  /"shadow\*" style props are deprecated/i,
  /props\.pointerEvents is deprecated/i,
  /Require cycle/i,
  /Development-level warnings/i,
  /expo-notifications.*Android Push/i,
  /deprecated.*expo-background-task/i,
  /Download the React DevTools/i,
  /water reminders failed to schedule/i,   // no notification API on web
  /reminders? failed to schedule/i,
];
const isNoise = (t) => NOISE.some((re) => re.test(t));

// ── the 30-day script ────────────────────────────────────────────────────────
// Each day names a shape; `planFor` turns it into the actions the driver runs.
// Shapes are deliberately uneven — a run where every day is identical proves
// nothing about a real user's data.
const SKIPPED = new Set([7, 15, 23, 34, 41, 52]);   // never opened the app
const PARTIAL = new Set([4, 9, 12, 18, 26, 31, 38, 45, 49, 56]); // started, drifted off
const RESCHEDULE_DAYS = new Set([11, 44]);          // move a dose's offset
const TZ_CROSS_DAYS = [20, 51];                     // operated just after local midnight
const MAX_DAY = 25;                                 // every field pushed to its ceiling
const EMPTY_DAY = 28;                               // every field submitted blank
const DEEP_SWEEP_DAY = 14;                          // walk the Settings sub-screens
const LOG_EVENT_EVERY = 4;                          // cadence for exercising the absorbed +Log Event panel

// ── the patient ──────────────────────────────────────────────────────────────
// A new synthetic patient, deliberately not the 30-day fixture. The daily dose
// follows the protocol's usual ~1000 IU/kg starting ratio, so what the app
// stores and charts sits in the range a real chart would hold rather than the
// 10000 IU placeholder the old fixture used.
const PATIENT = { name: 'Testpatient', weightKg: '62', dailyIU: '62000' };

// Clinical milestones. Lab panels bracket the run; urinary calcium climbs across
// them, because that is the number this protocol exists to watch.
const LAB_DAYS = {
  1:  { vitD: '32',  pth: '62', caSerum: '9.2', caUrine: '118', creat: '0.8', nfl: '9.1', note: 'Baseline panel, before first dose.' },
  30: { vitD: '148', pth: '24', caSerum: '9.6', caUrine: '214', creat: '0.9', nfl: '7.8', note: 'Week 4 panel. PTH falling as expected.' },
  60: { vitD: '192', pth: '13', caSerum: '9.9', caUrine: '268', creat: '0.9', nfl: '6.9', note: 'Week 8 panel. Urinary calcium climbing - watch.' },
};
const MRI_DAYS = {
  2:  { centre: 'Radiologie Mitte', lesions: 'None',                  note: 'Baseline scan.' },
  57: { centre: 'Radiologie Mitte', lesions: '2 new periventricular', note: 'Follow-up scan at week 8.' },
};
const SUPPLEMENT_DAY = 3;   // the protocol's co-supplements, entered once
const REPORT_DAY = 60;      // hand the run to a doctor
const SUPPLEMENTS = [
  { name: 'Magnesium Glycinate', dose: '400',  unit: 'mg',  stock: '90', days: '30' },
  { name: 'Vitamin K2 MK-7',     dose: '200',  unit: 'mcg', stock: '60', days: '30' },
  { name: 'Omega-3',             dose: '2000', unit: 'mg',  stock: '60', days: '30' },
];
const EVENT_TYPE_LABEL = { relapse: 'Relapse', cortisone: 'Cortisone', symptom: 'Symptom', pain: 'Pain' };

function dayDate(n) {
  const d = new Date(`${START}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (n - 1));
  return d.toISOString().slice(0, 10);
}
// Berlin is UTC+2 across this window; the offset is written explicitly so the
// simulated wall-clock is unambiguous rather than dependent on the host TZ.
const at = (n, hhmm) => new Date(`${dayDate(n)}T${hhmm}:00+02:00`);

function planFor(n) {
  if (SKIPPED.has(n)) return { shape: 'skipped' };
  if (TZ_CROSS_DAYS.includes(n)) return { shape: 'timezone-crossing' };
  if (n === MAX_DAY) return { shape: 'max-values' };
  if (n === EMPTY_DAY) return { shape: 'empty-values' };
  if (PARTIAL.has(n)) return { shape: 'partial' };
  if (RESCHEDULE_DAYS.has(n)) return { shape: 'reschedule' };
  return { shape: 'full' };
}

// ── findings ─────────────────────────────────────────────────────────────────
const findings = [];
let currentDay = 0;
let currentScreen = 'boot';
const screensHit = new Set();
// Settings sub-entries are counted separately from distinct screens.
//
// auditScreen() adds whatever name it is given to screensHit, and the Settings
// deep sweep calls it as `Settings/<row label>` for each of the eleven rows. So
// eleven rows read as eleven new screens and a run that covered 20 screens
// reported 31. That was never a defect in the app — it was a reporting defect
// that made an unchanged run look like new coverage, which is the worst kind
// because it reads as progress.
//
// A name containing "/" is a sub-entry of the screen before the slash: it is
// counted here, the parent is counted in screensHit, and the report gives both
// numbers instead of adding them together.
const subEntriesHit = new Set();
const note = (severity, screen, what, repro, cause) =>
  findings.push({ severity, screen, what, repro, cause, day: currentDay });

// ── main ─────────────────────────────────────────────────────────────────────
await mkdir(SHOTS, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  timezoneId: 'Europe/Berlin',
  locale: 'en-US',
});
const page = await context.newPage();

// Resolve app modules by source path at runtime. Metro's dev bundle passes a
// verboseName as __d's 4th argument; capturing the registrations lets the script
// read the app's real SQLite handle without adding a test export to source.
await page.addInitScript(() => {
  window.__PT_MODS = {};
  let real, wrapped;
  Object.defineProperty(window, '__d', {
    configurable: true,
    get() { return real ? wrapped : undefined; },
    set(fn) {
      real = fn;
      wrapped = function (factory, moduleId, deps, verboseName) {
        if (verboseName) window.__PT_MODS[verboseName] = moduleId;
        return real.apply(this, arguments);
      };
    },
  });
});

const consoleLog = [];
page.on('console', (m) => {
  const text = m.text();
  const type = m.type();
  consoleLog.push({ day: currentDay, screen: currentScreen, type, text });
  if ((type === 'error' || type === 'warning') && !isNoise(text)) {
    note(type === 'error' ? 'medium' : 'low', currentScreen,
      `console.${type}: ${text.slice(0, 240)}`, `day ${currentDay}`, '');
  }
});
page.on('pageerror', (e) => {
  consoleLog.push({ day: currentDay, screen: currentScreen, type: 'pageerror', text: e.message });
  if (!isNoise(e.message)) {
    note('high', currentScreen, `Uncaught: ${e.message.slice(0, 240)}`, `day ${currentDay}`, '');
  }
});

// ── page helpers ─────────────────────────────────────────────────────────────
// RN Web renders every touchable as a real <button role="button">. Clicking via
// the DOM rather than by coordinate matters here: onboarding mounts all three
// steps side by side in a translated slider, so a positional click lands on
// whichever step happens to be under the cursor.
const clickLabel = (label) => page.evaluate((l) => {
  const el = [...document.querySelectorAll('[aria-label]')].find((e) => e.getAttribute('aria-label') === l);
  if (!el) return false;
  el.click();
  return true;
}, label);

const clickText = (t, { exact = false } = {}) => page.evaluate(({ t, exact }) => {
  const hidden = new Set(document.querySelectorAll('[aria-hidden="true"]'));
  const buried = (el) => { for (let n = el; n; n = n.parentElement) if (hidden.has(n)) return true; return false; };
  const els = [...document.querySelectorAll('button,[role="button"],[tabindex]')].filter((e) => !buried(e));
  const hit = els.find((e) => {
    const s = (e.innerText || '').trim();
    return exact ? s === t : s.includes(t);
  });
  if (!hit) return false;
  hit.click();
  return true;
}, { t, exact });

const clickAnyText = (t, { exact = true } = {}) => page.evaluate(({ t, exact }) => {
  const hidden = new Set(document.querySelectorAll('[aria-hidden="true"]'));
  const buried = (el) => { for (let n = el; n; n = n.parentElement) if (hidden.has(n)) return true; return false; };
  const hit = [...document.querySelectorAll('div,span,a,button')].filter((e) => {
    if (buried(e)) return false;
    if (e.children.length) return false;              // innermost text box only
    const s = (e.textContent || '').trim();
    return exact ? s === t : s.includes(t);
  })[0];
  if (!hit) return false;
  hit.click();
  return true;
}, { t, exact });

// Calendar month-grid day cells carry a long composed accessibilityLabel
// (CalendarScreen.tsx:281) that varies with each day's data, so an exact
// aria-label match (clickLabel) is impractical here — match the ISO-date
// prefix instead.
const clickDayCell = (dateStr) => page.evaluate((d) => {
  const el = [...document.querySelectorAll('[aria-label]')].find((e) => (e.getAttribute('aria-label') || '').startsWith(d));
  if (!el) return false;
  el.click();
  return true;
}, dateStr);

/** Text of the screen actually on show — react-navigation keeps inactive tabs
 *  mounted and merely aria-hidden, so innerText('body') reads all of them. */
const screenText = () => page.evaluate(() => {
  const hidden = new Set(document.querySelectorAll('[aria-hidden="true"]'));
  const buried = (el) => { for (let n = el; n; n = n.parentElement) if (hidden.has(n)) return true; return false; };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const lines = []; let lastRoot = null;
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.nodeValue; if (!t || !t.trim()) continue;
    const el = n.parentElement; if (!el || buried(el)) continue;
    if (/^(SCRIPT|STYLE|NOSCRIPT|TITLE)$/.test(el.tagName)) continue;
    let root = el;
    for (let a = el; a; a = a.parentElement) if (a.getAttribute && a.getAttribute('dir') === 'auto') { root = a; break; }
    if (root === lastRoot && lines.length) lines[lines.length - 1] += t; else lines.push(t);
    lastRoot = root;
  }
  return lines.join('\n');
});
const flat = async () => (await screenText()).replace(/\s+/g, ' ');

const wait = (ms) => page.waitForTimeout(ms);

let shotIdx = 0;
async function shot(name) {
  shotIdx += 1;
  const file = join(SHOTS, `${String(shotIdx).padStart(3, '0')}-d${String(currentDay).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file }).catch(() => {});
  return file;
}

/** Run a step, record anything it throws, and keep the run alive. Never swallow. */
async function step(desc, fn) {
  try { return await fn(); }
  catch (e) {
    note('medium', currentScreen, `Step failed: ${desc} — ${String(e.message).split('\n')[0].slice(0, 200)}`,
      `day ${currentDay}, ${currentScreen}`, '');
    return null;
  }
}

// ── SQL bridge: the app's own database handle, read-only ─────────────────────
async function sql(query, params = []) {
  return page.evaluate(async ({ query, params }) => {
    const id = window.__PT_MODS['src/db/schema.ts'];
    if (id === undefined) throw new Error('schema module not registered');
    const db = await window.__r(id).getDb();
    return db.getAllAsync(query, params);
  }, { query, params });
}

/**
 * Has this dose been deliberately skipped?
 *
 * `DoseStatus` has no 'skipped' member yet (src/types/index.ts:1, frozen until
 * round 3 A2), so skipDose and skipDoseWithReason both write status='missed'
 * and stamp logged_time. markOverdueDoses also writes 'missed', but leaves
 * logged_time null — so logged_time is the only thing separating a dose the
 * patient skipped from one they never touched. Asserting on /skip/i against
 * status, as this harness did for sixty days, could therefore never pass: a
 * working skip stored the string "missed".
 *
 * A2 makes 'skipped' real. Both readings are accepted so the check keeps
 * meaning the same thing on either side of that change, and neither reading is
 * satisfied by an untouched dose.
 */
function doseIsSkipped(rows) {
  const r = rows && rows[0];
  if (!r) return false;
  const status = String(r.status ?? '');
  if (/^skipped$/i.test(status)) return true;
  return status === 'missed' && r.logged_time !== null && r.logged_time !== undefined;
}

// ── day-key drift: which rows were written DURING the crossing window ──────
//
// The previous check scanned every table at the end of the run and filed a
// finding for any row whose `date` equalled the day before a timezone-crossing
// day. Those rows exist because that day happened: the harness ran day 19 and
// day 50 normally and wrote real rows dated accordingly. So the check fired on
// every run no matter what the app did, which is not a test — it is a constant.
// It also cited `src/screens/HomeScreen.tsx:260/:275` as the culprit; that code
// is gone (`grep -rn "toISOString().split" src/` returns nothing, and
// `todayStr()` goes through `localDateStr`), so the finding named a line that
// does not exist.
//
// What is actually falsifiable: a row written WHILE the simulated clock stands
// between local midnight and 02:00 on the crossing day must carry that day's
// local date. In Europe/Berlin that window is the previous day in UTC, so a day
// key derived from toISOString() lands on `prev` and a local one lands on
// `tzDate`. Isolating "written during the window" is what the old check never
// did, so it is done here by rowid: snapshot the high-water mark per table
// before the day opens, and afterwards look only at rows added since.
//
// Limit, stated rather than hidden: this sees INSERTs. A row UPDATEd during the
// window onto a wrong date keeps its rowid and is invisible here. Catching that
// needs a column recording when the write happened, which the schema does not
// have; a false negative is the honest cost, and it beats a finding that cannot
// fail.
async function dateColumnTables() {
  const names = await sql("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").catch(() => []);
  const out = [];
  for (const { name } of names) {
    const cols = await sql(`PRAGMA table_info("${name}")`).catch(() => []);
    if (cols.some((c) => c.name === 'date')) out.push(name);
  }
  return out;
}

async function rowidHighWater() {
  const mark = {};
  for (const name of await dateColumnTables()) {
    const r = await sql(`SELECT COALESCE(MAX(rowid), 0) AS hi FROM "${name}"`).catch(() => []);
    mark[name] = Number(r[0]?.hi ?? 0);
  }
  return mark;
}

async function checkDayKeyDrift(n, mark) {
  const tzDate = dayDate(n);
  const prev = dayDate(n - 1);
  const drifted = [];
  const written = [];
  for (const [name, hi] of Object.entries(mark)) {
    const rows = await sql(`SELECT rowid AS rid, date FROM "${name}" WHERE rowid > ?`, [hi]).catch(() => []);
    for (const r of rows) {
      if (typeof r.date !== 'string') continue;
      written.push(`${name}#${r.rid}=${r.date}`);
      if (r.date !== tzDate) drifted.push(`${name}#${r.rid}.date=${r.date}`);
    }
  }

  if (drifted.length) {
    const utc = drifted.filter((d) => d.endsWith(prev));
    note('high', 'Today (timezone-crossing)',
      `Rows written between 00:20 and 01:40 local on ${tzDate} were stored under another date. ${utc.length ? `${utc.length} of them landed on ${prev}, which is the UTC date during that window — a day key computed from toISOString() rather than the local calendar date. ` : ''}Affected: ${drifted.join(', ')}`,
      `set the device clock to ${tzDate} 00:20 Europe/Berlin and log the day normally`,
      'src/db/queries.ts todayStr() / localDateStr(), and any screen computing its own day key');
    return;
  }

  if (!written.length) {
    // Nothing was inserted at all, so nothing was proved. Say that, rather than
    // letting an empty set read as a pass.
    note('low', 'Today (timezone-crossing)',
      `The day-key check on ${tzDate} proved nothing: no rows were inserted into any date-bearing table while the clock stood just after local midnight. Either the day's writes are UPDATEs (invisible to a rowid check) or the day did not run.`,
      `day ${n}`, 'e2e/protocol60.mjs checkDayKeyDrift');
  }
}

// ── navigate through the app's own navigation API ────────────────────────────
// Four registered screens (Report, MriTracker, LabResults, FamilySync) have no
// navigate() call anywhere in src/, so no tap sequence reaches them and the app
// has no linking config, so no URL does either. They are still real screens with
// real code, and the protocol's lab and MRI surfaces are among them — so this
// drives them through `src/navigation/navigationRef.ts`, which is the app's own
// exported navigate(), called at runtime. No app code is modified; the
// unreachability itself is filed as a finding, once, below.
async function navViaApp(tab, screen) {
  const r = await page.evaluate(({ tab, screen }) => {
    const id = window.__PT_MODS['src/navigation/navigationRef.ts'];
    if (id === undefined) return 'no-module';
    const m = window.__r(id);
    if (!m || typeof m.navigate !== 'function') return 'no-navigate';
    m.navigate(tab, { screen });
    return 'ok';
  }, { tab, screen });
  await wait(1800);
  return r;
}

/** Fill the first input carrying this placeholder. Returns false if absent. */
const fillPlaceholder = async (ph, value) => {
  const el = await page.getByPlaceholder(ph, { exact: true }).first();
  if (!(await el.count().catch(() => 0))) return false;
  await el.fill(value).catch(() => {});
  return true;
};

// ── layout audit ─────────────────────────────────────────────────────────────
/** Elements whose painted box escapes the 390px viewport, and text that renders
 *  as a raw i18n key. Measured from the box model, never eyeballed. */
async function auditScreen(name) {
  currentScreen = name;
  if (name.includes('/')) {
    subEntriesHit.add(name);
    screensHit.add(name.slice(0, name.indexOf('/')));
  } else {
    screensHit.add(name);
  }
  const probs = await page.evaluate(() => {
    const hidden = new Set(document.querySelectorAll('[aria-hidden="true"]'));
    const buried = (el) => { for (let n = el; n; n = n.parentElement) if (hidden.has(n)) return true; return false; };
    const out = { overflow: [], missingLabel: 0, i18nKeys: [], emptyButtons: 0 };
    const vw = document.documentElement.clientWidth;
    for (const el of document.querySelectorAll('*')) {
      if (buried(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Only a box that starts inside the viewport and runs past its right edge
      // is an overflow a user can see. A box parked entirely off-screen is a
      // carousel slide or an unmounted tab, not a layout bug.
      if (r.left >= -1 && r.left < vw && r.right > vw + 1) {
        const cs = getComputedStyle(el);
        // A wide child inside a scroller is a scroll region, not an overflow bug.
        let scrollable = false;
        for (let n = el.parentElement; n; n = n.parentElement) {
          const p = getComputedStyle(n);
          if (/(auto|scroll)/.test(p.overflowX)) { scrollable = true; break; }
        }
        if (!scrollable && cs.position !== 'fixed' && out.overflow.length < 6) {
          out.overflow.push({ tag: el.tagName, text: (el.innerText || '').slice(0, 60), right: Math.round(r.right), vw });
        }
      }
    }
    for (const b of document.querySelectorAll('button,[role="button"]')) {
      if (buried(b)) continue;
      const hasText = (b.innerText || '').trim().length > 0;
      const hasLabel = !!b.getAttribute('aria-label');
      if (!hasText && !hasLabel) out.emptyButtons += 1;
      else if (!hasLabel && !hasText) out.missingLabel += 1;
    }
    // Untranslated keys surface as the literal dotted path.
    const body = document.body.innerText || '';
    for (const m of body.matchAll(/\b[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*){1,3}\b/g)) {
      const s = m[0];
      if (/\.(png|jpg|com|de|org|ts|tsx|js)$/.test(s)) continue;
      if (out.i18nKeys.length < 5) out.i18nKeys.push(s);
    }
    return out;
  }).catch(() => null);
  if (!probs) return;
  for (const o of probs.overflow) {
    note('low', name, `Layout overflow: <${o.tag}> "${o.text.replace(/\n/g, ' ')}" paints to x=${o.right} in a ${o.vw}px viewport`,
      `open ${name}`, '');
  }
  if (probs.emptyButtons > 0) {
    note('low', name, `${probs.emptyButtons} control(s) with neither visible text nor accessibilityLabel — announced as unlabelled`,
      `open ${name}, inspect with a screen reader`, '');
  }
  for (const k of probs.i18nKeys) {
    note('medium', name, `Raw i18n key rendered as text: "${k}"`, `open ${name}`, 'src/i18n/en.ts');
  }
}

/** A control that is present but does nothing: click it and prove the screen
 *  did not change. Reported as "dead", which is a finding either way. */
async function probeDead(label, screen) {
  const before = await flat();
  const clicked = await clickLabel(label);
  if (!clicked) return null;
  await wait(900);
  const after = await flat();
  if (before === after) {
    note('medium', screen, `Control "${label}" is unresponsive — screen text unchanged after activating it`,
      `open ${screen}, tap "${label}"`, '');
  }
  return before !== after;
}

// ── navigation ───────────────────────────────────────────────────────────────
const TABS = ['History', 'Journal', 'Today', 'Trackers', 'Settings'];
// The tab bar renders as <a role="tab" href="/Home">, and its innerText is the
// icon glyph plus the label, so the href is the only stable handle.
// Records became Trackers on 2026-09-13. Only the visible label moved; the
// route id is still `Summary`, which is why gotoTab matches on the href and
// the rename costs one line here instead of a sweep.
const TAB_HREF = { History: '/Calendar', Journal: '/Journal', Today: '/Home', Trackers: '/Summary', Settings: '/Settings' };
async function gotoTab(label) {
  const press = () => page.evaluate(({ href, label }) => {
    const tabs = [...document.querySelectorAll('a[role="tab"]')];
    const hit = tabs.find((a) => a.getAttribute('href') === href)
      || tabs.find((a) => (a.getAttribute('href') || '').startsWith(href + '/'))
      || tabs.find((a) => (a.innerText || '').includes(label));
    if (!hit) return false;
    hit.click();
    return true;
  }, { href: TAB_HREF[label], label });
  let ok = await press();
  if (!ok) {
    // A full-screen modal overlay (the day-detail sheet, the dose sheet) covers
    // the tab bar and unmounts it. Give it a beat and look again before calling
    // the tab bar broken.
    await wait(1200);
    ok = await press();
  }
  if (!ok) {
    const seen = await page.evaluate(() => [...document.querySelectorAll('a[role="tab"]')].map((a) => `${a.getAttribute('href')}|${(a.innerText || '').replace(/\s+/g, ' ').trim()}`));
    note('high', 'tabbar', `Tab "${label}" not clickable — no tab anchor matched href "${TAB_HREF[label]}" or label "${label}". Tabs present: ${seen.join(' , ') || 'none'}`, 'any screen', 'src/navigation/index.tsx');
    return false;
  }
  await wait(1400);
  currentScreen = label;
  screensHit.add(label);
  return true;
}

// ── set the simulated moment ─────────────────────────────────────────────────
async function setMoment(n, hhmm) {
  await page.clock.setFixedTime(at(n, hhmm));
}

// ── onboarding (day 1) ───────────────────────────────────────────────────────
async function onboard() {
  currentScreen = 'onboarding';
  screensHit.add('onboarding');
  await auditScreen('onboarding/primer');
  await shot('primer');
  if (!(await clickText('Not now'))) {
    note('high', 'onboarding', 'Notification primer "Not now" not found — onboarding cannot be dismissed', 'fresh install', 'src/components/PermissionPrimingModal.tsx');
  }
  await wait(1600);
  await auditScreen('onboarding/profile');
  await page.getByPlaceholder('e.g. Alex').first().fill(PATIENT.name);
  await page.getByPlaceholder('e.g. 70').first().fill(PATIENT.weightKg);
  await page.getByPlaceholder('e.g. 5000').first().fill(PATIENT.dailyIU);
  await wait(400);
  await shot('profile-filled');
  await clickLabel('Next step'); await wait(1500);
  await auditScreen('onboarding/condition');
  if (!(await clickLabel('Select condition: Multiple Sclerosis'))) {
    note('high', 'onboarding', 'Condition card not selectable', 'onboarding step 2', 'src/screens/OnboardingScreen.tsx:223');
  }
  await wait(800);
  await shot('condition');
  await clickLabel('Next step'); await wait(1500);
  await auditScreen('onboarding/almost-ready');
  await shot('almost-ready');
  if (!(await clickLabel("Let's begin"))) {
    note('high', 'onboarding', 'Final onboarding button did not fire', 'onboarding step 3', 'src/screens/OnboardingScreen.tsx:271');
  }
  await wait(8000);
  currentScreen = 'Today';
  screensHit.add('Today');
  await shot('home-first');
}

// ── reachability: is there any tap path to the protocol's own surfaces? ──────
//
// This used to grep the screen for /share with doctor|report/i and call the job
// done. Three things were wrong with that. The regex matched text the app has
// never rendered — the button's visible label is `shareProgress`, "Share Your
// Progress", and its accessibility name is "Share your progress"; neither
// contains "share with doctor", and "report" appears nowhere on the screen. The
// finding it emitted was hardcoded prose naming SummaryScreen as having no
// navigation, which stopped being true two rounds ago. And a string on a screen
// is not a tap path: a button can render perfectly and go nowhere.
//
// So: tap each control by its accessible name and assert the app actually
// landed on the target screen, then come back. "No control" and "control that
// does nothing" are different defects and get reported as different findings,
// because they have different fixes.
const CLINICAL = [
  {
    name: 'Lab Results',
    label: 'Lab results',
    route: 'LabResults',
    // Body text of the destination that History itself never renders.
    landed: /add lab result|no lab results|creatinine|sulkowitch/i,
  },
  {
    name: 'MRI History',
    label: 'MRI history',
    route: 'MriTracker',
    landed: /log mri scan|log first scan|save scan|lesion/i,
  },
  {
    name: 'Share with Doctor',
    label: 'Share your progress',
    route: 'Report',
    landed: /generate report|could not create the report/i,
  },
];

let reachabilityChecked = false;
async function checkReachability() {
  if (reachabilityChecked) return;
  reachabilityChecked = true;

  for (const target of CLINICAL) {
    await gotoTab('History');
    await wait(900);
    const before = await flat();

    // The control itself. Match the accessible name, which is what a screen
    // reader and a harness both have to work with.
    const tapped = await clickLabel(target.label);
    if (!tapped) {
      note('high', 'History',
        `No control named "${target.label}" on History — ${target.name} has no tap path. The route is registered in src/navigation/index.tsx under the Summary stack, so the screen exists and the code runs; nothing reaches it.`,
        `open History, scroll below the month grid, look for ${target.name}`,
        `src/screens/CalendarScreen.tsx (clinical row) vs src/navigation/index.tsx (${target.route} registered under SummaryNavigator)`);
      continue;
    }

    await wait(1800);
    const after = await flat();
    if (target.landed.test(after)) {
      await shot(`reach-${target.route.toLowerCase()}`);
      continue;
    }

    // The control is there and the tap changed nothing that matters. Say which
    // of the two it is, because a tap that navigates somewhere wrong and a tap
    // that is inert are not the same bug.
    const moved = after !== before;
    // Prove the screen is reachable at all before blaming the tap: if the app's
    // own navigate() gets there, the route is fine and the tap path is the
    // defect. If it does not, the route registration is.
    const viaApp = await navViaApp('Summary', target.route);
    const afterBridge = await flat();
    const bridgeLanded = viaApp === 'ok' && target.landed.test(afterBridge);

    note('high', 'History',
      bridgeLanded
        ? `Tapping "${target.label}" on History does not open ${target.name}, but the app's own navigate('Summary', { screen: '${target.route}' }) does. The control renders and is accessible; the navigation call behind it cannot resolve the route. ${target.route} is registered inside SummaryNavigator (the Trackers tab's stack) while the button now lives on CalendarScreen, and a bare navigate('${target.route}') from a sibling tab's stack is not resolved by react-navigation — it only searches the current navigator and its parents. Screen ${moved ? 'changed but is not the target' : 'is byte-identical after the tap'}.`
        : `${target.name} cannot be reached at all: tapping "${target.label}" on History does nothing, and the app's own navigate('Summary', { screen: '${target.route}' }) did not land either (bridge said "${viaApp}").`,
      `open History, scroll below the month grid, tap ${target.name}`,
      `src/screens/CalendarScreen.tsx (navigate('${target.route}')) vs src/navigation/index.tsx (${target.route} registered under SummaryNavigator)`);

    await shot(`reach-${target.route.toLowerCase()}-failed`);
  }

  await gotoTab('History');
  await wait(600);
}

// ── the protocol's clinical milestones ───────────────────────────────────────
async function labPanel(n) {
  const lab = LAB_DAYS[n];
  if (!lab) return;
  // Lab Results / MRI History / Share Your Progress moved to the History tab
  // with the compliance block on 2026-09-13. The routes are still registered
  // under the Summary stack, so navViaApp's fallback is unchanged.
  await gotoTab('History');
  await wait(900);
  let nav = (await clickLabel('Lab results')) ? 'ok' : null;
  if (nav) { await wait(1800); } else { nav = await navViaApp('Summary', 'LabResults'); }
  if (nav !== 'ok') {
    note('high', 'LabResults', `Could not reach the Lab Results screen at all (navigationRef bridge said "${nav}")`, `day ${n}`, 'src/navigation/navigationRef.ts');
    return;
  }
  await auditScreen('LabResults');
  await shot('labs-open');
  if (!(await clickLabel('Add lab result')) && !(await clickText('Add lab result'))) {
    note('high', 'LabResults', 'No "Add lab result" control on the Lab Results screen — a lab panel cannot be entered', `day ${n}`, 'src/screens/LabResultsScreen.tsx:158');
    return;
  }
  await wait(900);
  await auditScreen('LabResults/form');
  await fillPlaceholder('YYYY-MM-DD', dayDate(n));
  const fields = [['e.g. 180', lab.vitD], ['e.g. 18', lab.pth], ['e.g. 9.4', lab.caSerum],
                  ['e.g. 210', lab.caUrine], ['e.g. 0.8', lab.creat], ['e.g. 7.4', lab.nfl]];
  for (const [ph, v] of fields) {
    if (!(await fillPlaceholder(ph, v))) {
      note('medium', 'LabResults/form', `Lab field with placeholder "${ph}" is missing from the form`, `day ${n}`, 'src/screens/LabResultsScreen.tsx');
    }
  }
  const SULK = { 1: 'None', 30: 'Slight', 60: 'Moderate' };
  if (SULK[n] && !(await clickLabel(`Sulkowitch: ${SULK[n]}`))) {
    note('medium', 'LabResults/form', `Sulkowitch chip "${SULK[n]}" not selectable`, `day ${n}`, 'src/screens/LabResultsScreen.tsx:214');
  }
  await fillPlaceholder('Lab name, fasting status, doctor comments...', lab.note);
  await wait(300);
  await shot('labs-filled');
  if (!(await clickLabel('Save lab result'))) {
    note('high', 'LabResults/form', 'Save control not found on the lab form — the panel cannot be stored', `day ${n}`, 'src/screens/LabResultsScreen.tsx:237');
    return;
  }
  await wait(1600);
  await shot('labs-saved');
  const rows = await sql('SELECT * FROM lab_results WHERE date = ?', [dayDate(n)]).catch(() => []);
  if (!rows.length) {
    note('high', 'LabResults', `Lab panel entered on ${dayDate(n)} was not written to lab_results`, `day ${n}: enter a full lab panel and save`, 'src/screens/LabResultsScreen.tsx handleSave');
  }
}

async function mriEntry(n) {
  const m = MRI_DAYS[n];
  if (!m) return;
  await gotoTab('History');
  await wait(900);
  let nav = (await clickLabel('MRI history')) ? 'ok' : null;
  if (nav) { await wait(1800); } else { nav = await navViaApp('Summary', 'MriTracker'); }
  if (nav !== 'ok') {
    note('high', 'MriTracker', `Could not reach the MRI screen (navigationRef bridge said "${nav}")`, `day ${n}`, 'src/navigation/navigationRef.ts');
    return;
  }
  await auditScreen('MriTracker');
  await shot('mri-open');
  if (!(await clickText('+ Log MRI Scan')) && !(await clickText('Log First Scan'))) {
    note('high', 'MriTracker', 'No control to log an MRI scan', `day ${n}`, 'src/screens/MriScreen.tsx:260');
    return;
  }
  await wait(900);
  await auditScreen('MriTracker/form');
  await fillPlaceholder('YYYY-MM-DD', dayDate(n));
  await fillPlaceholder('e.g. Bethel Bielefeld', m.centre);
  await fillPlaceholder('e.g. "None" or "2 new periventricular"', m.lesions);
  await fillPlaceholder('Radiologist comments, key findings...', m.note);
  await wait(300);
  await shot('mri-filled');
  if (!(await clickText('Save Scan'))) {
    note('high', 'MriTracker/form', 'Save control not found on the MRI form — a scan cannot be stored', `day ${n}`, 'src/screens/MriScreen.tsx:365');
    return;
  }
  await wait(1600);
  await shot('mri-saved');
}

let namelessAddReported = false;
async function addSupplements(n) {
  await gotoTab('Settings');
  await auditScreen('Settings');
  if (!(await clickText('Manage supplements')) && !(await clickText('Supplements'))) {
    note('high', 'Settings', 'No "Manage Supplements" row — the protocol co-supplements cannot be entered', `day ${n}`, 'src/screens/SettingsScreen.tsx:402');
    return;
  }
  await wait(1600);
  await auditScreen('SupplementEditor');
  await shot('supplements-open');
  for (const sup of SUPPLEMENTS) {
    const before = (await sql('SELECT COUNT(*) c FROM supplements').catch(() => [{ c: -1 }]))[0].c;
    // The add control IS named: SupplementEditorScreen.tsx:264 renders
    // `accessibilityLabel={showAddForm ? 'Close the add supplement form' : 'Add
    // a supplement'}` with accessibilityRole="button". The comment that used to
    // sit here said the opposite, and the harness filed "no accessible name"
    // every single run without ever checking — the note was unconditional, one
    // line below a geometry hunt that only existed because of the same wrong
    // premise.
    //
    // So: try the name first, which is what a screen reader has. Fall back to
    // geometry only if the name is genuinely absent, and file the a11y finding
    // only in that case.
    const addName = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[aria-label]')]
        .find((e) => /^(add a supplement|close the add supplement form)$/i.test((e.getAttribute('aria-label') || '').trim()));
      return el ? el.getAttribute('aria-label') : null;
    });

    let opened = false;
    if (addName) {
      opened = await clickLabel(addName);
    }
    if (!opened) opened = await page.evaluate(() => {
      const isGlyph = (t) => t.length === 1 && t.codePointAt(0) >= 0xe000 && t.codePointAt(0) <= 0xf8ff;
      // The "+" sits at the top right of the header. Picking the last glyph in
      // DOM order instead grabbed the expand chevron on the first supplement
      // card, which opened that card's editor and started overwriting the
      // patient's existing D3 row — so anchor on geometry, rightmost wins.
      const vw = document.documentElement.clientWidth;
      const cands = [...document.querySelectorAll('*')].filter((e) => {
        const t = (e.textContent || '').trim();
        if (!isGlyph(t)) return false;
        const r = e.getBoundingClientRect();
        return r.top < 200 && r.right > vw * 0.7 && r.width > 10 && r.width < 80;
      }).sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right);
      if (!cands.length) return false;
      // Click the outermost tappable ancestor, which is where onPress is bound.
      let el = cands[0];
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const r = n.getBoundingClientRect();
        if (r.width > 30 && r.width < 90 && r.height > 30) { el = n; break; }
      }
      el.click();
      return true;
    });
    if (!opened) {
      note('medium', 'SupplementEditor', `No add control found when adding "${sup.name}"`, `day ${n}`, 'src/screens/SupplementEditorScreen.tsx:259');
      break;
    }
    // Only if the assertion actually failed.
    if (!addName && !namelessAddReported) {
      namelessAddReported = true;
      note('medium', 'SupplementEditor',
        'The "add supplement" button has no accessible name — screen-reader users cannot identify it and no name-based test can reach it; the harness had to find it by geometry',
        'open Settings > Manage supplements and inspect the header button',
        'src/screens/SupplementEditorScreen.tsx:259-265');
    }
    await wait(900);
    if (!(await flat()).includes('New Supplement')) {
      note('medium', 'SupplementEditor',
        `The add-supplement form did not open when adding "${sup.name}" — the tap landed somewhere else, so no fields were filled`,
        `day ${n}: Settings > Manage supplements > "+"`, 'src/screens/SupplementEditorScreen.tsx:259');
      await shot('supplement-add-form-missing');
      break;
    }
    await fillPlaceholder('e.g. Magnesium Glycinate', sup.name);
    await fillPlaceholder('400', sup.dose);
    await fillPlaceholder('mg · IU · mcg', sup.unit);
    await fillPlaceholder('0', sup.stock);
    await fillPlaceholder('30', sup.days);
    await wait(300);
    await shot(`supplement-${sup.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 20)}`);
    if (!(await clickText('Add Supplement')) && !(await clickAnyText('Add Supplement'))) {
      note('medium', 'SupplementEditor', `"Add Supplement" control not found while adding "${sup.name}"`, `day ${n}`, 'src/screens/SupplementEditorScreen.tsx:276');
      break;
    }
    await wait(1400);
    const after = (await sql('SELECT COUNT(*) c FROM supplements').catch(() => [{ c: -1 }]))[0].c;
    if (after !== -1 && before !== -1 && after <= before) {
      note('medium', 'SupplementEditor', `Adding "${sup.name}" did not increase the supplements table (${before} -> ${after})`, `day ${n}: Settings > Manage Supplements > add`, 'src/screens/SupplementEditorScreen.tsx:234');
    }
  }
  await shot('supplements-after');
  await gotoTab('Today');
}

async function doctorReport(n) {
  await gotoTab('History');
  await wait(900);
  let nav = (await clickLabel('Share your progress')) ? 'ok' : null;
  if (nav) { await wait(1800); } else { nav = await navViaApp('Summary', 'Report'); }
  if (nav !== 'ok') {
    note('high', 'Report', `Could not reach the doctor report screen (navigationRef bridge said "${nav}")`, `day ${n}`, 'src/navigation/navigationRef.ts');
    return;
  }
  await auditScreen('Report');
  await shot('report-open');
  const t = await flat();
  if (!/\d/.test(t)) {
    note('medium', 'Report', `The doctor report renders no numbers after ${n} days of data: "${t.slice(0, 200)}"`, `day ${n}: open Share with Doctor`, 'src/screens/ReportScreen.tsx');
  }
  for (const label of ['Export', 'Share', 'PDF', 'Generate']) {
    const before = await flat();
    if (await clickText(label)) {
      await wait(1800);
      await shot(`report-${label.toLowerCase()}`);
      const after = await flat();
      if (before === after) {
        note('low', 'Report', `"${label}" on the doctor report changed nothing on screen (native share/print is a no-op on web — verify on device)`, `day ${n}`, 'src/screens/ReportScreen.tsx');
      }
      break;
    }
  }
}

async function protocolMilestones(n) {
  if (LAB_DAYS[n]) await step(`lab panel day ${n}`, () => labPanel(n));
  if (MRI_DAYS[n]) await step(`mri entry day ${n}`, () => mriEntry(n));
  if (n === SUPPLEMENT_DAY) await step('co-supplements', () => addSupplements(n));
  if (n === REPORT_DAY) await step('doctor report', () => doctorReport(n));
  if (LAB_DAYS[n] || MRI_DAYS[n] || n === REPORT_DAY) {
    await navViaApp('Summary', 'SummaryMain');
    await gotoTab('Today');
  }
}

// ── one simulated day ────────────────────────────────────────────────────────
async function runDay(n) {
  currentDay = n;
  const plan = planFor(n);
  const date = dayDate(n);

  // The wall-clock the day opens at. The timezone-crossing day deliberately
  // opens 20 minutes after local midnight, when the local date and the UTC date
  // disagree — that is where a day key computed from toISOString() drifts.
  const openAt = plan.shape === 'timezone-crossing' ? '00:20' : '07:30';
  await setMoment(n, openAt);

  // High-water rowid per date-bearing table, taken before the day writes
  // anything, so the day-key check at the bottom can look at this day's rows
  // alone instead of at every row in the database. See checkDayKeyDrift.
  const rowidMark = plan.shape === 'timezone-crossing' ? await rowidHighWater().catch(() => null) : null;

  // Every fifth day is a cold boot (reload); the rest re-enter through the tab
  // bar, which is what a phone does when the app is resumed the next morning.
  if (n === 1 || n % 5 === 0) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await wait(n === 1 ? 9000 : 7000);
  } else {
    await gotoTab('Trackers');
    await gotoTab('Today');
  }
  currentScreen = 'Today';
  screensHit.add('Today');

  if (plan.shape === 'skipped') {
    await auditScreen('Today');
    await shot('skipped');
    return { day: n, date, shape: plan.shape };
  }

  // Dismiss the first-day wizard if it is up.
  await clickLabel('Dismiss wizard, start using the app').catch(() => {});
  await clickText("Got it, let's start").catch(() => {});
  await wait(600);

  await auditScreen('Today');

  // ── start the day ──────────────────────────────────────────────────────────
  const started = await step('start day', async () => {
    const txt = await flat();
    if (!txt.includes('Start My Day')) return 'already';
    const ok = await clickText('Start My Day');
    if (!ok) { note('high', 'Today', 'Start My Day button present in text but not clickable', `day ${n}`, 'src/components/StartDayButton.tsx'); return false; }
    await wait(3200);
    const after = await flat();
    if (after.includes('Start My Day')) {
      note('high', 'Today', 'Start My Day did not start the day — button still on screen after tapping',
        `day ${n}: open Today, tap Start My Day`, 'src/engine/scheduler.ts:11');
      return false;
    }
    return true;
  });
  await shot('after-start');

  if (plan.shape === 'empty-values') {
    // Submit the day's inputs with nothing in them and see what the app stores.
    await step('empty journal', async () => {
      await gotoTab('Journal');
      await auditScreen('Journal');
      await clickLabel('Save journal entry'); await wait(1200);
      await shot('journal-empty-save');
      await gotoTab('Today');
    });
  }

  // ── the protocol: take or skip the day's doses ─────────────────────────────
  const LATE_DOSE_DAY = 17;
  await setMoment(n, plan.shape === 'timezone-crossing' ? '00:35' : n === LATE_DOSE_DAY ? '11:00' : '07:45');
  await step('doses', async () => {
    if (plan.shape !== 'timezone-crossing') {
      const sched = await sql('SELECT scheduled_time FROM dose_logs WHERE date = ? ORDER BY scheduled_time', [date]).catch(() => []);
      if (sched.length && sched[0].scheduled_time) {
        // Stand at the dose window, the way a patient with a reminder does.
        await page.clock.setFixedTime(new Date(Number(sched[0].scheduled_time) + 5 * 60 * 1000));
        await wait(700);
      } else if (!sched.length) {
        note('medium', 'Today', `No dose_logs row exists for ${date} after starting the day — nothing was scheduled to take`, `day ${n}`, 'src/engine/scheduler.ts');
      }
    }
    const expanded = await clickLabel('Expand to see all doses');
    if (!expanded) return;
    await wait(1200);
    await auditScreen('Today/doses');
    await shot('doses-expanded');
    // Dose rows carry a composed accessibilityLabel (DoseRow.tsx:120).
    const rows = await page.evaluate(() => [...document.querySelectorAll('[aria-label]')]
      .map((e) => e.getAttribute('aria-label'))
      .filter((l) => /, scheduled at /.test(l)));   // DoseRow.tsx:114 composes this
    if (!rows.length) {
      note('medium', 'Today/doses', 'Expanded dose list exposes no dose rows with accessible names', `day ${n}`, 'src/components/DoseRow.tsx:120');
      return;
    }
    // Partial days leave the dose untouched on purpose.
    if (plan.shape === 'partial') return;
    await clickLabel(rows[0]); await wait(1200);
    await auditScreen('DoseDetailModal');
    await shot('dose-modal');
    // DoseDetailModal.tsx:172 / :180 — "✓ Took it" and the translated "Skip".
    const skipping = plan.shape === 'max-values';
    const takeLabel = skipping ? 'Skip' : 'Took it';
    const wantPrefix = skipping ? 'Skip ' : 'Mark ';
    const clickPrefix = (pref) => page.evaluate((p) => {
      const el = [...document.querySelectorAll('[aria-label]')]
        .find((e) => (e.getAttribute('aria-label') || '').startsWith(p));
      if (!el) return false;
      el.click();
      return true;
    }, pref);

    const acted = await clickPrefix(wantPrefix) || await clickText(takeLabel);
    if (!acted) {
      note('medium', 'DoseDetailModal', `No control matching "${takeLabel}" in the dose sheet — dose cannot be logged`,
        `day ${n}: Today > expand doses > tap a dose`, 'src/components/DoseDetailModal.tsx');
    } else {
      // Read the row back rather than trusting the tap. status/logged_time is
      // the only proof the action reached the database.
      await wait(1400);
      const read = () => sql('SELECT status, logged_time, skip_reason FROM dose_logs WHERE date = ?', [date]).catch(() => []);
      let after = await read();

      // ── the skip is a two-step flow, and it is mid-change ──────────────────
      // "Skip" opened a reason picker and wrote nothing; only tapping a reason
      // reached the database (handleSkipPress vs handleReasonSelect,
      // DoseDetailModal.tsx:64/:68). The audit recorded that as "Skip does not
      // persist" for sixty days because the harness tapped Skip, waited, and
      // read back a row that was still upcoming — it never tapped a reason, and
      // the reason buttons had no accessible name to tap by. They do now
      // (`Skip this dose: <reason>`, landed with H1 on fix/lane-ui).
      //
      // Round 3 A1 makes one tap skip outright, with the reason as an optional
      // second step. So this handles both shapes rather than either: if the
      // first tap already moved the row, stop; otherwise look for the picker
      // and complete it. When A1 lands, the `reasonNeeded` branch simply stops
      // being taken, and the difference is visible in the report instead of
      // silently changing what "skip works" means.
      let usedReason = null;
      if (skipping && !doseIsSkipped(after)) {
        const reasons = await page.evaluate(() => [...document.querySelectorAll('[aria-label]')]
          .map((e) => e.getAttribute('aria-label') || '')
          .filter((l) => l.startsWith('Skip this dose: ')));
        if (reasons.length) {
          usedReason = reasons[0];
          await clickLabel(usedReason);
          await wait(1400);
          after = await read();
        } else {
          note('high', 'DoseDetailModal',
            `Tapping "Skip" wrote nothing and the sheet offers no reason control to finish with. dose_logs.status is "${after[0]?.status}", logged_time ${after[0]?.logged_time ?? 'null'}. Either the single tap should write (round 3 A1) or the reason buttons need accessible names — as written the skip is unreachable by name.`,
            `day ${n}: Today > expand doses > tap the dose > "Skip"`,
            'src/components/DoseDetailModal.tsx:64 handleSkipPress');
        }
      }

      if (skipping) {
        if (!doseIsSkipped(after) && after.length) {
          note('high', 'DoseDetailModal',
            `The dose was not skipped${usedReason ? ` even after tapping "${usedReason}"` : ' on a single tap'}: dose_logs.status is "${after[0].status}", logged_time ${after[0].logged_time === null ? 'null' : after[0].logged_time}, skip_reason ${after[0].skip_reason === null || after[0].skip_reason === undefined ? 'null' : `"${after[0].skip_reason}"`}.`,
            `day ${n}: start the day, open Today > expand doses > tap the dose > "Skip"${usedReason ? ' > a reason' : ''}`,
            'src/components/DoseDetailModal.tsx handleSkipPress/handleReasonSelect -> src/db/queries.ts skipDose');
        } else if (usedReason && (after[0]?.skip_reason === null || after[0]?.skip_reason === undefined)) {
          note('medium', 'DoseDetailModal',
            `A reason was tapped ("${usedReason}") but dose_logs.skip_reason is null — the reason was discarded even though the skip landed.`,
            `day ${n}: Today > expand doses > tap the dose > "Skip" > a reason`,
            'src/db/queries.ts skipDoseWithReason');
        }
      } else if (after.length && !/taken|took/i.test(String(after[0].status))) {
        note('high', 'DoseDetailModal',
          `Tapping "${takeLabel}" in the dose sheet did not change the stored dose: dose_logs.status is "${after[0].status}", logged_time ${after[0].logged_time === null ? 'null' : after[0].logged_time} — inside the 30-minute tolerance window (offset 0, scheduled ${new Date(Number((await sql('SELECT scheduled_time FROM dose_logs WHERE date = ?', [date]))[0].scheduled_time)).toISOString()})`,
          `day ${n}: start the day, open Today > expand doses > tap the dose > "${takeLabel}"`,
          'src/components/DoseDetailModal.tsx onTook -> src/db/queries.ts confirmDose');
      }
    }
    await shot('dose-acted');
    await clickText('Collapse').catch(() => {});
  });

  // ── supplements: water + sun ───────────────────────────────────────────────
  await step('water', async () => {
    const ml = plan.shape === 'max-values' ? 750 : 250;
    const reps = plan.shape === 'max-values' ? 6 : plan.shape === 'partial' ? 1 : 4;
    for (let i = 0; i < reps; i++) {
      if (!(await clickLabel(`Set ${ml} millilitres`))) {
        note('medium', 'Today', `Water preset "Set ${ml} millilitres" not found — water cannot be logged`, `day ${n}`, 'src/components/WaterTracker.tsx:116');
        return;
      }
      await wait(200);
      if (!(await clickLabel(`Log ${ml} millilitres of water`))) {
        note('medium', 'Today', `Water commit button "Log ${ml} ml" not found`, `day ${n}`, 'src/components/WaterTracker.tsx:128');
        return;
      }
      await wait(450);
    }
    await shot('water');
  });
  await step('sun', async () => {
    if (plan.shape === 'partial') return;
    const min = plan.shape === 'max-values' ? 60 : 20;
    const reps = plan.shape === 'max-values' ? 3 : 1;
    for (let i = 0; i < reps; i++) {
      if (!(await clickLabel(`Set ${min} minutes`))) {
        note('medium', 'Today', `Sun preset "Set ${min} minutes" not found — sun exposure cannot be logged`, `day ${n}`, 'src/components/SunTracker.tsx:96');
        return;
      }
      await wait(200);
      if (!(await clickLabel(`Log ${min} minutes of sun`))) {
        note('medium', 'Today', `Sun commit button "Log ${min} min" not found`, `day ${n}`, 'src/components/SunTracker.tsx:108');
        return;
      }
      await wait(450);
    }
    await shot('sun');
  });

  if (plan.shape === 'partial') {
    await shot('partial-end');
    return { day: n, date, shape: plan.shape };
  }

  // ── check-ins ──────────────────────────────────────────────────────────────
  await setMoment(n, plan.shape === 'timezone-crossing' ? '01:10' : '21:20');
  await step('sleep check-in', async () => {
    if (!(await clickLabel('Sleep check-in'))) return;
    await wait(1500);
    await auditScreen('Sleep');
    await shot('sleep');
    const inputs = await page.$$('input,textarea');
    if (inputs.length && plan.shape !== 'empty-values') {
      await inputs[0].fill(plan.shape === 'max-values' ? '24' : '7').catch(() => {});
    }
    await clickText('Save'); await wait(1200);
    await shot('sleep-saved');
    await gotoTab('Today');
  });

  // ── journal ────────────────────────────────────────────────────────────────
  await step('journal', async () => {
    if (plan.shape === 'empty-values') return; // already exercised empty above
    await gotoTab('Journal');
    await auditScreen('Journal');
    const body = plan.shape === 'max-values' ? 'X'.repeat(5000) : `Day ${n}: steady, no side effects.`;
    if (!(await fillPlaceholder('How are you feeling today?', body))) {
      note('medium', 'Journal', 'Journal note field (placeholder "How are you feeling today?") not found', `day ${n}`, 'src/screens/JournalScreen.tsx:429');
    }
    await fillPlaceholder('Any dairy, calcium supplements, or protocol deviations today?',
      plan.shape === 'max-values' ? 'Hard cheese at lunch, 300 mg calcium.' : 'No dairy.');
    // Mood buttons carry `Select mood <label>` (JournalScreen.tsx:162); vary the
    // mood by day so the Journal mood strip has something to plot.
    const MOOD_LABELS = ['Great', 'Good', 'Okay', 'Rough', 'Struggling'];
    const wantMood = MOOD_LABELS[n % MOOD_LABELS.length];
    if (!(await clickLabel(`Select mood ${wantMood}`))) {
      note('low', 'Journal', `Mood button "${wantMood}" not selectable`, `day ${n}`, 'src/screens/JournalScreen.tsx:162');
    }
    const MOOD_EMOJI = { Great: '😄', Good: '🙂', Okay: '😐', Rough: '😔', Struggling: '😞' };
    // The Save button is disabled until the mood selection commits to state, and
    // a click on a disabled control is a silent no-op — so wait for the commit
    // rather than racing it, or the blur-autosave's value is what gets stored.
    await wait(1000);
    if (!(await clickLabel('Save journal entry'))) {
      note('medium', 'Journal', 'Save button not found on Journal', `day ${n}`, 'src/screens/JournalScreen.tsx:207');
    }
    await wait(1400);
    await shot('journal-saved');
    const savedMood = await sql('SELECT mood, note FROM journal_entries WHERE date = ?', [date]).catch(() => []);
    if (savedMood.length && savedMood[0].mood !== MOOD_EMOJI[wantMood]) {
      note('high', 'Journal',
        `Journal stored mood "${savedMood[0].mood}" after "${wantMood}" (${MOOD_EMOJI[wantMood]}) was tapped — the mood selection is not being saved`,
        `day ${n}: Journal > tap mood "${wantMood}" > Save`, 'src/screens/JournalScreen.tsx handleSave / selectedMood');
    }
    if (savedMood.length && !String(savedMood[0].note || '').length && plan.shape !== 'empty-values') {
      note('high', 'Journal', 'Journal note was typed but journal_entries.note came back empty', `day ${n}`, 'src/screens/JournalScreen.tsx handleSave');
    }

    // Absorbed feature: "+ Log Event" used to be its own screen; it now
    // expands in place. Exercise it on a cadence (a real user logs medical
    // events rarely, not daily) so the merged panel gets real submissions —
    // across different event types — over the course of the run.
    if (n % LOG_EVENT_EVERY === 0) {
      const opened = await clickLabel('Show event log form');
      if (!opened) {
        note('medium', 'Journal', 'Log-event disclosure ("+ Log Event") not found/clickable', `day ${n}`, 'src/screens/JournalScreen.tsx');
      } else {
        await wait(500);
        await auditScreen('Journal/logEvent');
        await shot('log-event-open');
        const et = Object.keys(EVENT_TYPE_LABEL)[(n / LOG_EVENT_EVERY) % 4];
        if (!(await clickText(EVENT_TYPE_LABEL[et], { exact: true }))) {
          note('medium', 'Journal', `Event type "${et}" not selectable in the log-event panel`, `day ${n}`, 'src/screens/JournalScreen.tsx');
        }
        if (et === 'pain') await clickText('Dysesthetic (burning/tingling)');
        if (et === 'cortisone') {
          const eventInputs = await page.$$('input,textarea');
          await eventInputs[eventInputs.length - 2]?.fill('500').catch(() => {});
        } else {
          await clickText('3', { exact: true }).catch(() => {});
        }
        const notesInputs = await page.$$('input,textarea');
        if (notesInputs.length) await notesInputs[notesInputs.length - 1].fill(`Day ${n} event note (${et}).`).catch(() => {});
        await wait(300);
        await shot('log-event-filled');
        if (!(await clickText('Log Event', { exact: true }))) {
          note('medium', 'Journal', `Could not submit the log-event form for type "${et}" — button missing or disabled`, `day ${n}`, 'src/screens/JournalScreen.tsx');
        } else {
          await wait(1200);
          const afterSubmit = await flat();
          if (!/Logged/.test(afterSubmit)) {
            note('medium', 'Journal', `Log-event submit for type "${et}" did not show the "Logged ✓" confirmation`, `day ${n}`, 'src/screens/JournalScreen.tsx');
          }
        }
        await shot('log-event-submitted');
        await clickLabel('Hide event log form').catch(() => {});
      }
    }

    await gotoTab('Today');
  });

  // ── the protocol's clinical milestones ─────────────────────────────────────
  if (n === 1) await step('reachability of protocol surfaces', checkReachability);
  await protocolMilestones(n);

  // ── the rescheduled dose ───────────────────────────────────────────────────
  if (plan.shape === 'reschedule') {
    await step('reschedule a dose', async () => {
      await gotoTab('Settings');
      await auditScreen('Settings');
      if (!(await clickText('Schedule'))) {
        note('low', 'Settings', 'No "Schedule" entry point found from Settings', `day ${n}`, 'src/screens/SettingsScreen.tsx');
        return;
      }
      await wait(1600);
      await auditScreen('Schedule');
      await shot('schedule');
      const inputs = await page.$$('input,textarea');
      if (inputs.length) { await inputs[0].fill('90').catch(() => {}); await wait(400); }
      await clickText('Save'); await wait(1200);
      await shot('schedule-saved');
      await gotoTab('Today');
    });
  }

  // ── the deep sweep: every Settings sub-screen, once ────────────────────────
  if (n === DEEP_SWEEP_DAY) {
    await step('settings sweep', async () => {
      await gotoTab('Settings');
      await auditScreen('Settings');
      await shot('settings');
      const entries = await page.evaluate(() => {
        const hidden = new Set(document.querySelectorAll('[aria-hidden="true"]'));
        const buried = (el) => { for (let n = el; n; n = n.parentElement) if (hidden.has(n)) return true; return false; };
        return [...document.querySelectorAll('button,[role="button"]')]
          .filter((e) => !buried(e))
          .map((e) => (e.innerText || '').trim().split('\n')[0])
          .filter((s) => s && s.length < 40);
      });
      for (const label of entries.slice(0, 18)) {
        if (TABS.includes(label)) continue;
        const before = await flat();
        const ok = await clickText(label, { exact: false });
        if (!ok) continue;
        await wait(1500);
        const after = await flat();
        if (before === after) {
          note('medium', 'Settings', `Settings row "${label}" does nothing when tapped`, `day ${n}: Settings > ${label}`, 'src/screens/SettingsScreen.tsx');
          continue;
        }
        await auditScreen(`Settings/${label}`);
        await shot(`settings-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 24)}`);
        // Back out: prefer an explicit back control, else the tab bar.
        const back = await clickText('←') || await clickLabel('Go back') || await clickText('Back');
        await wait(1200);
        if (!back) await gotoTab('Settings');
        else { currentScreen = 'Settings'; }
        if (!(await flat()).includes('Settings')) await gotoTab('Settings');
      }
      await gotoTab('Today');
    });
  }

  // ── close the day ──────────────────────────────────────────────────────────
  await setMoment(n, plan.shape === 'timezone-crossing' ? '01:40' : '22:10');
  await step('close day', async () => {
    const closed = await clickText('End My Day') || await clickText('Close Day') || await clickText('Finish Day');
    if (closed) { await wait(1800); await shot('day-closed'); }
  });

  // Trackers + History are the two non-Today surfaces; look at them on a
  // cadence so the
  // weekly/streak logic is exercised as history accumulates.
  if (n % 3 === 0) {
    await step('trackers', async () => { await gotoTab('Trackers'); await auditScreen('Trackers'); await shot('trackers'); });
    await step('history', async () => { await gotoTab('History'); await auditScreen('History'); await shot('history'); });
    await gotoTab('Today');
  }

  if (rowidMark) {
    await step('day-key drift', async () => { await checkDayKeyDrift(n, rowidMark); });
  }

  await shot('day-end');
  return { day: n, date, shape: plan.shape };
}

// ── backward/forward day-stepper: walk real history via the History tab's own
// day-detail modal (CalendarScreen.tsx openDay/stepDay), not by re-deriving
// dates in this script. Proves the "backward" half: that 30 real days written
// by runDay() can still be read back correctly, day by day, through the same
// control a user taps. ─────────────────────────────────────────────────────
async function dayStepperPass(lastSimulatedDay) {
  currentScreen = 'History';
  const lastDate = dayDate(lastSimulatedDay);

  await step('day-stepper: open history tab', async () => {
    await gotoTab('History');
    await auditScreen('History');
  });

  const opened = await step('day-stepper: open last simulated day', async () => {
    for (let tries = 0; tries < 3; tries++) {
      if (await clickDayCell(lastDate)) return true;
      await clickLabel('Next month');
      await wait(700);
    }
    return false;
  });
  if (!opened) {
    note('high', 'History', `Could not open the day-detail modal for ${lastDate} from the month grid`, 'History tab, tap the last simulated day', 'src/screens/CalendarScreen.tsx:274');
    return;
  }
  await wait(900);
  await shot('history-detail-open');

  // ── walk backward ───────────────────────────────────────────────────────
  const backSteps = Math.min(60, lastSimulatedDay - 1);
  let reachedBack = 0;
  for (let i = 0; i < backSteps; i++) {
    const before = await flat();
    if (!(await clickLabel('Previous day'))) {
      note('high', 'History', `"Previous day" control missing after ${i} backward step(s)`, `history back-walk step ${i + 1}`, 'src/screens/CalendarScreen.tsx:325');
      break;
    }
    await wait(650);
    const after = await flat();
    if (before === after) {
      note('medium', 'History', `"Previous day" tap at back-step ${i + 1} did not change the detail content`, `history back-walk step ${i + 1} (day ${dayDate(lastSimulatedDay - i - 1)})`, 'src/screens/CalendarScreen.tsx:150');
    }
    reachedBack = i + 1;
  }
  await shot(`history-back-${reachedBack}`);

  // Cross-check the furthest-back day reached against the app's own DB, via
  // the read-only sql() bridge — not by re-deriving what "should" be there.
  const oldestDate = dayDate(lastSimulatedDay - reachedBack);
  await step('day-stepper: cross-check oldest day against SQLite truth', async () => {
    const journalRows = await sql('SELECT mood FROM journal_entries WHERE date = ?', [oldestDate]);
    const eventRows = await sql('SELECT type FROM relapse_events WHERE date = ?', [oldestDate]);
    const shown = await flat();
    if (journalRows.length > 0 && !shown.includes(journalRows[0].mood)) {
      note('high', 'History', `DB has a journal mood ("${journalRows[0].mood}") for ${oldestDate} but the day-detail modal does not show it`, `history: back-walk to ${oldestDate}`, 'src/screens/CalendarScreen.tsx:359 (detail.journal)');
    }
    if (eventRows.length > 0 && /No events logged|noEventsShort/i.test(shown)) {
      note('high', 'History', `DB has ${eventRows.length} event(s) for ${oldestDate} but the day-detail modal reports no events`, `history: back-walk to ${oldestDate}`, 'src/screens/CalendarScreen.tsx:370 (detail.events)');
    }
    if (eventRows.length === 0 && !/No events logged|noEventsShort|Keine Ereignisse/i.test(shown) && !shown.includes('EVENTS')) {
      // Soft signal only — the events section header is always present, so
      // absence of the empty-state copy alone isn't proof of a defect.
    }
  });

  // ── walk forward back to today ──────────────────────────────────────────
  for (let i = 0; i < reachedBack; i++) {
    if (!(await clickLabel('Next day'))) {
      note('high', 'History', `"Next day" control missing after ${i} forward step(s)`, `history forward-walk step ${i + 1}`, 'src/screens/CalendarScreen.tsx:329');
      break;
    }
    await wait(650);
  }
  await shot('history-forward-to-last');

  // Boundary: from the last simulated day (today, in simulated time), Next
  // day must be a no-op — there is no future data.
  const beforeBoundary = await flat();
  await clickLabel('Next day').catch(() => {});
  await wait(500);
  const afterBoundary = await flat();
  if (beforeBoundary !== afterBoundary) {
    note('high', 'History', 'Tapping "Next day" from the most recent simulated day changed the detail content — the forward boundary (no future days) is not enforced', 'history: at the last simulated day, tap Next day', 'src/screens/CalendarScreen.tsx:150 (next > todayStr() guard) / :329 (disabled prop)');
  }
  await shot('history-forward-boundary');

  // Leave the day-detail modal closed — it is a full-screen overlay
  // (CalendarScreen.tsx styles.modalOverlay), and later steps switch tabs.
  if (!(await clickLabel('Close'))) {
    note('medium', 'History', 'Day-detail modal "Close" control not found at the end of the day-stepper walk', 'history day-stepper cleanup', 'src/screens/CalendarScreen.tsx:389');
  }
  await wait(500);
}

// ── run ──────────────────────────────────────────────────────────────────────
const log = (s) => process.stderr.write(s + '\n');
log(`▶ thirtyday: ${TOTAL_DAYS} days from ${START} against ${BASE_URL}`);

await setMoment(1, '07:30');
await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
await wait(9000);
await onboard();

const days = [];
for (let n = 1; n <= TOTAL_DAYS; n++) {
  const before = findings.length;
  const r = await runDay(n).catch((e) => {
    note('high', currentScreen, `Day ${n} aborted: ${String(e.message).split('\n')[0].slice(0, 200)}`, `day ${n}`, '');
    return { day: n, date: dayDate(n), shape: planFor(n).shape, aborted: true };
  });
  days.push(r);
  log(`  day ${String(n).padStart(2)} ${r.shape.padEnd(18)} +${findings.length - before} finding(s)`);
}

log(`▶ day-stepper: walking History backward from day ${TOTAL_DAYS}, then forward again`);
const beforeStepper = findings.length;
await dayStepperPass(TOTAL_DAYS).catch((e) => {
  note('high', 'History', `Day-stepper pass aborted: ${String(e.message).split('\n')[0].slice(0, 200)}`, 'history back/forward walk', '');
});
log(`  day-stepper +${findings.length - beforeStepper} finding(s)`);

// ── cross-check the accumulated data against what the app shows ──────────────
currentScreen = 'verification';
const tables = {};
await step('dump tables', async () => {
  const names = await sql("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  for (const { name } of names) {
    tables[name] = await sql(`SELECT * FROM "${name}"`).catch((e) => ({ error: String(e.message) }));
  }
});

// The day-key drift check now runs inside runDay() for each crossing day, on
// the rows that day actually inserted. See checkDayKeyDrift.

// Adherence/streak surfaces should reflect 30 days of history, not zero.
await step('compliance sanity', async () => {
  // The compliance block moved from the Records tab to History on 2026-09-13,
  // under the month grid. Reading it off the Trackers tab — which is now four
  // launcher cards and no numbers — would report zero forever.
  //
  // The old check also tested /0\s*%\s*Compliance/, and nothing in the app has
  // ever rendered the word "Compliance" next to a percentage: the label is
  // "Weighted Adherence". That half could not fail, so it is gone rather than
  // carried across. What is left reads the two labels the screen really paints.
  await gotoTab('History');
  await auditScreen('History');
  await shot('final-history');
  const t = await flat();

  const streak = /(\d+)\s*Day Streak/i.exec(t);
  const adherence = /(\d+)\s*%\s*Weighted Adherence/i.exec(t);
  const doses = /(\d+)\s*\/\s*(\d+)\s*Doses Today/i.exec(t);

  if (!streak && !adherence && !doses) {
    note('high', 'History', `The compliance block did not render on History at all after ${TOTAL_DAYS} days: "${t.slice(0, 300)}"`,
      `run the ${TOTAL_DAYS}-day pass, open History and scroll below the month grid`,
      'src/screens/CalendarScreen.tsx (compliance block, moved from SummaryScreen)');
  } else if (streak && Number(streak[1]) === 0) {
    note('high', 'History', `Day Streak reads 0 after ${TOTAL_DAYS} days of logged data: "${t.slice(0, 300)}"`,
      `run the ${TOTAL_DAYS}-day pass, open History`, 'src/hooks/useSummaryScreen.ts');
  } else if (adherence && Number(adherence[1]) === 0) {
    note('high', 'History', `Weighted Adherence reads 0% after ${TOTAL_DAYS} days of logged data: "${t.slice(0, 300)}"`,
      `run the ${TOTAL_DAYS}-day pass, open History`, 'src/hooks/useSummaryScreen.ts');
  }

  // Trackers is a launcher now. It owes four cards and no numbers; a compliance
  // figure left behind here would mean the restructure copied rather than moved.
  await gotoTab('Trackers');
  await auditScreen('Trackers');
  await shot('final-trackers');
  const tr = await flat();
  const missing = ['Water', 'Sunlight', 'Exercise', 'Food'].filter((c) => !tr.includes(c));
  if (missing.length) {
    note('high', 'Trackers', `The Trackers tab is missing its ${missing.join(', ')} card(s): "${tr.slice(0, 300)}"`,
      'open the Trackers tab', 'src/screens/SummaryScreen.tsx');
  }
  if (/Doses Today|Weighted Adherence/i.test(tr)) {
    note('medium', 'Trackers', `Trackers still renders compliance numbers that moved to History: "${tr.slice(0, 300)}"`,
      'open the Trackers tab', 'src/screens/SummaryScreen.tsx');
  }
});

// ── export ───────────────────────────────────────────────────────────────────
await step('export sqlite', async () => {
  const bytes = await page.evaluate(async () => {
    const id = window.__PT_MODS['src/db/schema.ts'];
    const db = await window.__r(id).getDb();
    const u8 = await db.serializeAsync('main');
    return Array.from(u8);
  });
  await writeFile(join(OUT, 'data.sqlite'), Buffer.from(bytes));
});

const dataJson = {
  generatedAt: new Date().toISOString(),
  simulatedStart: START,
  simulatedDays: days.length,
  timezone: 'Europe/Berlin',
  patient: PATIENT,
  plan: { skipped: [...SKIPPED], partial: [...PARTIAL], reschedule: [...RESCHEDULE_DAYS], timezoneCrossing: TZ_CROSS_DAYS, maxValues: MAX_DAY, emptyValues: EMPTY_DAY, labDays: Object.keys(LAB_DAYS).map(Number), mriDays: Object.keys(MRI_DAYS).map(Number), supplementDay: SUPPLEMENT_DAY, reportDay: REPORT_DAY },
  days,
  tables,
};
await writeFile(join(OUT, 'data.json'), JSON.stringify(dataJson, null, 2));
await writeFile(join(OUT, 'console.json'), JSON.stringify(consoleLog.filter((c) => c.type !== 'log'), null, 2));

// ── patient.md — the chart, read back out of the app's own database ──────────
// Every number below was written by the app's own code paths while the UI was
// driven; nothing here was inserted by hand or recomputed by this script.
await step('patient record', async () => {
  const T = (name) => (Array.isArray(tables[name]) ? tables[name] : []);
  const byDate = (rows) => {
    const m = new Map();
    for (const r of rows) {
      if (!r || typeof r.date !== 'string') continue;
      if (!m.has(r.date)) m.set(r.date, []);
      m.get(r.date).push(r);
    }
    return m;
  };
  const doses = byDate(T('dose_logs'));
  const water = byDate(T('water_logs'));
  const sun = byDate(T('sun_log'));
  const journal = byDate(T('journal_entries'));
  const events = byDate(T('relapse_events'));
  const anchors = byDate(T('daily_anchors'));
  const exercise = byDate(T('exercise_logs'));

  const num = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
  const dayRows = [];
  let takenTotal = 0, scheduledTotal = 0, waterTotal = 0, sunTotal = 0, daysWithAnchor = 0;

  for (let n = 1; n <= days.length; n++) {
    const d = dayDate(n);
    const shape = days[n - 1]?.shape ?? '—';
    const dl = doses.get(d) ?? [];
    const taken = dl.filter((r) => /taken|took|done/i.test(String(r.status))).length;
    const skipped = dl.filter((r) => /skip/i.test(String(r.status))).length;
    takenTotal += taken; scheduledTotal += dl.length;
    const ml = (water.get(d) ?? []).reduce((a, r) => a + (Number(r.amount_ml) || 0), 0);
    waterTotal += ml;
    const min = (sun.get(d) ?? []).reduce((a, r) => a + (Number(r.minutes) || 0), 0);
    sunTotal += min;
    const j = (journal.get(d) ?? [])[0];
    const ev = (events.get(d) ?? []).map((r) => r.type).join(', ');
    const ex = (exercise.get(d) ?? []).reduce((a, r) => a + (Number(r.duration_minutes) || 0), 0);
    const anchor = (anchors.get(d) ?? [])[0];
    if (anchor) daysWithAnchor += 1;
    const t0 = anchor?.t0_timestamp
      ? new Date(Number(anchor.t0_timestamp)).toLocaleTimeString('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
      : '—';
    dayRows.push(`| ${n} | ${d} | ${shape} | ${t0} | ${dl.length ? `${taken}/${dl.length}` : '—'}${skipped ? ` (${skipped} skipped)` : ''} | ${ml || '—'} | ${min || '—'} | ${ex || '—'} | ${j ? num(j.mood) : '—'} | ${j && j.note ? `${String(j.note).length} ch` : '—'} | ${ev || '—'} |`);
  }

  const labRows = T('lab_results').sort((a, b) => String(a.date).localeCompare(String(b.date))).map((r) =>
    `| ${r.date} | ${num(r.vit_d_ngml)} | ${num(r.pth_pgml)} | ${num(r.calcium_serum_mgdl)} | ${num(r.calcium_urine_mg_g_cr)} | ${num(r.creatinine_mgdl)} | ${num(r.nfl_pgl)} | ${num(r.sulkowitch)} | ${String(r.notes ?? '').replace(/\|/g, '/')} |`);
  const mriRows = T('mri_scans').sort((a, b) => String(a.date).localeCompare(String(b.date))).map((r) =>
    `| ${r.date} | ${num(r.facility)} | ${num(r.scan_type)} | ${r.contrast ? 'yes' : 'no'} | ${num(r.new_lesions)} | ${num(r.enhancing_lesions)} | ${num(r.overall_assessment)} | ${String(r.notes ?? '').replace(/\|/g, '/')} |`);
  const supRows = T('supplements').map((r) => `| ${num(r.name)} | ${num(r.form)} | ${num(r.category)} | ${String(r.notes ?? '').replace(/\|/g, '/')} |`);
  const profile = T('user_profile')[0] ?? {};

  const rowCounts = Object.entries(tables)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => [k, v.length])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `| ${k} | ${n} |`);

  const adherence = scheduledTotal ? Math.round((takenTotal / scheduledTotal) * 100) : 0;

  const pmd = [
    `# Patient record — ${TOTAL_DAYS} simulated days`,
    '',
    `Generated ${new Date().toISOString()}. Every row was written by the app's own code, driven through the UI in a single browser session; no SQL was inserted by hand and no app source was modified.`,
    '',
    '## Patient',
    '',
    '| field | value |',
    '| --- | --- |',
    `| name (as entered) | ${PATIENT.name} |`,
    `| name (as stored) | ${num(profile.name)} |`,
    `| weight | ${PATIENT.weightKg} kg (stored: ${num(profile.weight_kg)}) |`,
    `| daily D3 entered | ${PATIENT.dailyIU} IU |`,
    `| start date (stored) | ${num(profile.start_date)} |`,
    `| timezone | ${num(profile.timezone)} |`,
    `| simulated window | ${dayDate(1)} → ${dayDate(TOTAL_DAYS)} (Europe/Berlin) |`,
    '',
    '## Adherence',
    '',
    '| metric | value |',
    '| --- | --- |',
    `| days the app was opened | ${days.filter((d) => d.shape !== 'skipped').length} of ${TOTAL_DAYS} |`,
    `| days with a started day (t0 anchor) | ${daysWithAnchor} |`,
    `| doses taken / scheduled | ${takenTotal} / ${scheduledTotal} (${adherence}%) |`,
    `| total water logged | ${waterTotal} ml |`,
    `| total sun logged | ${sunTotal} min |`,
    `| journal entries | ${T('journal_entries').length} |`,
    `| medical events | ${T('relapse_events').length} |`,
    `| lab panels | ${T('lab_results').length} |`,
    `| MRI scans | ${T('mri_scans').length} |`,
    '',
    '## Day by day',
    '',
    '| day | date | shape | t0 | doses | water ml | sun min | exercise min | mood | journal | events |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...dayRows,
    '',
    '## Lab panels',
    '',
    labRows.length ? '| date | Vit D 25-OH ng/mL | PTH pg/mL | Ca serum mg/dL | Ca urine mg/g cr | creatinine mg/dL | NfL pg/mL | Sulkowitch | notes |' : '_No lab panels were stored._',
    ...(labRows.length ? ['| --- | --- | --- | --- | --- | --- | --- | --- | --- |', ...labRows] : []),
    '',
    '## MRI scans',
    '',
    mriRows.length ? '| date | facility | type | contrast | new lesions | enhancing | assessment | notes |' : '_No MRI scans were stored._',
    ...(mriRows.length ? ['| --- | --- | --- | --- | --- | --- | --- | --- |', ...mriRows] : []),
    '',
    '## Supplements',
    '',
    supRows.length ? '| name | form | category | notes |' : '_No supplements were stored._',
    ...(supRows.length ? ['| --- | --- | --- | --- |', ...supRows] : []),
    '',
    '## Every table the app wrote',
    '',
    '| table | rows |',
    '| --- | --- |',
    ...rowCounts,
    '',
    `Raw: \`data.json\` (every row, every table) · \`data.sqlite\` (the database itself) · \`console.json\` · \`shots/\` (${shotIdx} screenshots) · \`audit.md\` (the bugs).`,
    '',
  ].join('\n');
  await writeFile(join(OUT, 'patient.md'), pmd);
});

// ── audit.md ─────────────────────────────────────────────────────────────────
// Dedupe: the same defect fires once per day otherwise. Collapse on
// severity+screen+message and record how many days it recurred.
const seen = new Map();
for (const f of findings) {
  const key = `${f.severity}|${f.screen}|${f.what}`;
  if (!seen.has(key)) seen.set(key, { ...f, days: [f.day], count: 1 });
  else { const e = seen.get(key); e.count += 1; if (!e.days.includes(f.day)) e.days.push(f.day); }
}
const RANK = { high: 0, medium: 1, low: 2 };
const deduped = [...seen.values()].sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.count - a.count);
// A defect that reproduced on many independent days is certain; a one-off is a
// suspicion until someone reproduces it.
const certain = deduped.filter((f) => f.count >= 2 || f.severity === 'high');
// Everything else is a medium/low one-off. This column swung 14 -> 6 between two
// runs of IDENTICAL code, so it is not a measurement and must not be read as
// one: a one-off depends on where the simulated clock happened to land, whether
// an animation had settled, and which day a console warning attached itself to.
// It is not made deterministic here — that would mean removing the timing
// dependence from a dozen unrelated checks — so it is labelled advisory
// everywhere it appears, and it is kept out of every headline number.
const suspected = deduped.filter((f) => !certain.includes(f));

const row = (f) => `| ${f.severity} | ${f.screen} | ${f.what.replace(/\|/g, '\\|')} | ${f.repro.replace(/\|/g, '\\|')} | ${f.cause || '—'} |`;
const md = [
  `# Protocol Tracker — ${TOTAL_DAYS}-day protocol simulation audit`,
  '',
  `Generated ${new Date().toISOString()} · ${days.length} simulated days from ${START} (Europe/Berlin) · ${screensHit.size} distinct screens (+ ${subEntriesHit.size} sub-entries).`,
  '',
  `Clock seam: **none in app source** — driven via Playwright \`clock.setFixedTime\`, which replaces \`Date\`/\`Date.now\` in the page and leaves timers real. No app code was modified for this run.`,
  '',
  `**Counts: ${certain.length} certain.** ${findings.length} raw observations before dedupe.`,
  '',
  `Plus ${suspected.length} advisory one-offs, listed below and **deliberately not part of the count**. That column swung 14 → 6 between two runs of identical code; it is not a measurement and a change in it is not a trend.`,
  '',
  '## Certain',
  '',
  '| severity | screen | what breaks | repro step | likely cause |',
  '| --- | --- | --- | --- | --- |',
  ...certain.map(row),
  '',
  '## Advisory — one-offs, not a count',
  '',
  '_Each of these fired on exactly one day at medium or low severity. They are timing-sensitive: this list swung 14 → 6 between two runs of identical code. Read a row, do not read the length._',
  '',
  '| severity | screen | what breaks | repro step | likely cause |',
  '| --- | --- | --- | --- | --- |',
  ...suspected.map(row),
  '',
  '## Coverage',
  '',
  `Screens (${screensHit.size}): ${[...screensHit].sort().join(', ')}`,
  '',
  `Sub-entries reached (${subEntriesHit.size}, not counted as screens): ${[...subEntriesHit].sort().join(', ') || 'none'}`,
  '',
  `Day shapes: ${days.map((d) => `${d.day}:${d.shape}`).join(', ')}`,
  '',
].join('\n');
await writeFile(join(OUT, 'audit.md'), md);

log(`\n${days.length} days · ${screensHit.size} screens (+${subEntriesHit.size} sub-entries) · ${certain.length} certain · ${suspected.length} advisory one-offs (not a count) → ${join(OUT, 'audit.md')}`);
await browser.close();
