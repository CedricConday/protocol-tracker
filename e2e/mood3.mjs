// mood3.mjs — the 3-day mood repro (PT-trio item 1.5).
//
// Lane 3 is blocked on this. Item 3.2: the Journal discards the mood that was
// tapped — over 60 simulated days the harness taps all five moods evenly and
// only two ever persist (😄 ×34, 🙂 ×10), with sixteen days writing no row at
// all. The 60-day run is the wrong instrument for that. It takes the better
// part of an hour, taps exactly one mood per day, and its counts swing between
// runs of identical code. This does the opposite: three days, five taps each,
// and a full state capture after every single tap.
//
// UPDATED 2026-09-20 for schema v17 (2026-09-17). A day no longer holds one
// journal entry: the UNIQUE on `journal_entries.date` is gone and the editor is
// a COMPOSER — Save appends a row and clears the fields, instead of rewriting
// the day's single row. Everything here that said "the row for this date" was
// written under the old rule and read `rows[0]`, which is now the day's OLDEST
// entry rather than the one a tap just produced. Probes collect every entry for
// the date; checks ask about the newest. Check 2 was rewritten rather than
// repointed — see its comment; under the composer its old statement describes
// correct behaviour, so left alone it would have failed on every run.
//
// WHAT IS BEING MEASURED. `selectedMood` is not state. JournalScreen.tsx:144:
//
//     const selectedMood = moodEntry && moodEntry.date === today ? moodEntry.mood : null;
//
// A tap can therefore fail to show up for two unrelated reasons: `moodEntry`
// never changed (the tap never reached `handleMoodSelect`), or `moodEntry.date`
// stopped matching `today` (the clock moved under it). Those need different
// fixes, and a probe that reads only the derived value cannot tell them apart.
// So every probe captures `moodEntry` and `today` separately, plus the stored
// row, plus what the DOM is actually showing.
//
// Reading `moodEntry` without editing the app: walk the React fiber from a mood
// button up to the JournalScreen component and dump its hook chain. The hook
// holding `{date, mood}` identifies itself by shape on the first successful
// tap; its index is stable for the rest of the run. No app code is modified —
// the same stance as the SQL and navigation bridges in protocol60.mjs.
//
// THE BLUR RACE, made deliberate. `handleBlur` (JournalScreen.tsx:167) calls
// `handleSave` whenever a note field loses focus and a mood is set. Tapping a
// mood while the note has focus therefore fires blur-save with the PRE-tap mood
// in the same gesture that sets the new one. Phase C does exactly that, on
// purpose, and captures both sides. Phase A taps with nothing focused, so the
// two paths can be told apart rather than averaged.
//
//   node e2e/mood3.mjs              # 3 days
//   node e2e/mood3.mjs --days 1     # one day while iterating
//
// Output: e2e/report/mood3/{sequence.json,mood3.md,shots/}
//
// This script REPORTS. It fixes nothing and asserts nothing fatal — a probe
// that throws is recorded and the run continues, because a sequence with a hole
// in it is still evidence and a crashed run is not.
import { chromium } from './lib/playwright.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE_URL = process.env.PT_E2E_URL || 'http://localhost:8085';
const OUT = process.env.PT_OUT || 'e2e/report/mood3';
const SHOTS = join(OUT, 'shots');
const START = '2026-07-01';
const DAYS = Number(process.env.PT_DAYS || process.argv[process.argv.indexOf('--days') + 1]) || 3;

const MOODS = [
  { emoji: '😄', label: 'Great' },
  { emoji: '🙂', label: 'Good' },
  { emoji: '😐', label: 'Okay' },
  { emoji: '😔', label: 'Rough' },
  { emoji: '😞', label: 'Struggling' },
];
const PATIENT = { name: 'Moodtest', weightKg: '62', dailyIU: '62000' };
const TAB_HREF = { History: '/Calendar', Journal: '/Journal', Today: '/Home', Trackers: '/Summary', Settings: '/Settings' };

function dayDate(n) {
  const d = new Date(`${START}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (n - 1));
  return d.toISOString().slice(0, 10);
}
// Berlin is UTC+2 across this window; written explicitly so the simulated
// wall-clock does not depend on the host timezone.
const at = (n, hhmm) => new Date(`${dayDate(n)}T${hhmm}:00+02:00`);

const sequence = [];   // every probe, in order — this is the deliverable
const problems = [];   // things the driver itself could not do

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

// Metro's dev bundle passes a verboseName as __d's 4th argument. Capturing the
// registrations lets the script reach the app's own SQLite handle and its own
// todayStr() without adding a test export to source. Same bridge protocol60.mjs
// uses; kept identical on purpose so the two agree about what "today" means.
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
let currentDay = 0;
let currentPhase = 'boot';
page.on('console', (m) => consoleLog.push({ day: currentDay, phase: currentPhase, type: m.type(), text: m.text() }));
page.on('pageerror', (e) => consoleLog.push({ day: currentDay, phase: currentPhase, type: 'pageerror', text: e.message }));

const wait = (ms) => page.waitForTimeout(ms);

let shotIdx = 0;
async function shot(name) {
  shotIdx += 1;
  const file = join(SHOTS, `${String(shotIdx).padStart(3, '0')}-d${currentDay}-${name}.png`);
  await page.screenshot({ path: file }).catch(() => {});
  return file;
}

const clickLabel = (label) => page.evaluate((l) => {
  const el = [...document.querySelectorAll('[aria-label]')].find((e) => e.getAttribute('aria-label') === l);
  if (!el) return false;
  el.click();
  return true;
}, label);

const clickText = (t) => page.evaluate((needle) => {
  const hidden = new Set(document.querySelectorAll('[aria-hidden="true"]'));
  const buried = (el) => { for (let n = el; n; n = n.parentElement) if (hidden.has(n)) return true; return false; };
  const hit = [...document.querySelectorAll('button,[role="button"],[tabindex]')]
    .filter((e) => !buried(e))
    .find((e) => (e.innerText || '').includes(needle));
  if (!hit) return false;
  hit.click();
  return true;
}, t);

async function gotoTab(label) {
  const ok = await page.evaluate(({ href, label }) => {
    // Path only: a tab's href carries its nested route once you have been into
    // the stack (`/Summary?screen=Report`), so an exact match misses.
    const path = (a) => (a.getAttribute('href') || '').split(/[?#]/)[0];
    const tabs = [...document.querySelectorAll('a[role="tab"]')];
    const hit = tabs.find((a) => path(a) === href)
      || tabs.find((a) => path(a).startsWith(href + '/'))
      || tabs.find((a) => (a.innerText || '').includes(label));
    if (!hit) return false;
    hit.click();
    return true;
  }, { href: TAB_HREF[label], label });
  if (!ok) problems.push(`day ${currentDay}: tab "${label}" not clickable`);
  await wait(1400);
  return ok;
}

async function sql(query, params = []) {
  return page.evaluate(async ({ query, params }) => {
    const id = window.__PT_MODS['src/db/schema.ts'];
    if (id === undefined) throw new Error('schema module not registered');
    const db = await window.__r(id).getDb();
    return db.getAllAsync(query, params);
  }, { query, params });
}

// ── the probe ────────────────────────────────────────────────────────────────
// One reading of everything that matters, from four independent sources: the
// app's own todayStr(), the React fiber, the DOM, and SQLite. They are captured
// together so a disagreement between them is visible in a single row.
let moodHookIndex = null;   // learned from the first tap that lands

async function readState() {
  return page.evaluate(() => {
    const out = { fiber: null, fiberError: null, fiberTree: null, appToday: null, appTodayError: null, dom: {} };

    // The app's own idea of today, from the app's own function.
    try {
      const id = window.__PT_MODS['src/db/queries.ts'];
      out.appToday = id === undefined ? null : window.__r(id).todayStr();
      if (id === undefined) out.appTodayError = 'queries module not registered';
    } catch (e) { out.appTodayError = String(e && e.message || e); }

    // ── DOM: what a user would actually see ──
    const moodBtns = [...document.querySelectorAll('[aria-label]')]
      .filter((e) => /^Select mood /.test(e.getAttribute('aria-label')));
    out.dom.moodButtons = moodBtns.map((e) => {
      const cs = getComputedStyle(e);
      return {
        label: e.getAttribute('aria-label').replace('Select mood ', ''),
        background: cs.backgroundColor,
        border: cs.borderTopColor,
        opacity: cs.opacity,
      };
    });
    // The selected button is the one styled differently from the majority
    // (moodSelected vs moodUnselected). Derived by counting rather than by
    // hardcoding a colour, so a theme change does not silently break the probe.
    const tally = {};
    for (const b of out.dom.moodButtons) {
      const k = `${b.background}|${b.border}`;
      tally[k] = (tally[k] || 0) + 1;
    }
    const majority = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    out.dom.selectedByStyle = majority && majority[1] < out.dom.moodButtons.length
      ? out.dom.moodButtons.filter((b) => `${b.background}|${b.border}` !== majority[0]).map((b) => b.label)
      : [];

    const save = [...document.querySelectorAll('[aria-label]')]
      .find((e) => /^(Save journal entry|Journal entry saved)$/.test(e.getAttribute('aria-label')));
    out.dom.save = save
      ? {
          label: save.getAttribute('aria-label'),
          ariaDisabled: save.getAttribute('aria-disabled'),
          domDisabled: save.disabled === true,
          text: (save.innerText || '').trim(),
        }
      : null;

    const focused = document.activeElement;
    out.dom.focused = focused && focused !== document.body
      ? (focused.getAttribute('placeholder') || focused.tagName)
      : null;

    // ── React fiber: moodEntry, and the whole hook chain for Lane 3 ──
    try {
      // React double-buffers: every component has two fibers and they swap on
      // each commit. Walking UP from a DOM node lands in whichever tree that
      // node's handle points at, which is one render stale about half the time
      // — the probe then reports the previous mood on alternating taps, an
      // artifact that looks exactly like the bug being hunted. Measured: doing
      // it that way produced mismatches on taps 2 and 4 while the painted DOM
      // showed the correct selection on every tap.
      //
      // So start from the FiberRoot instead and walk DOWN. `fiberRoot.current`
      // is by definition the committed tree, so anything reached from it is the
      // state the app has actually rendered.
      let containerFiber = null;
      const roots = [document.getElementById('root'), ...document.querySelectorAll('body > div')];
      for (const el of roots) {
        if (!el) continue;
        const k = Object.keys(el).find((x) => x.startsWith('__reactContainer$'));
        if (k) { containerFiber = el[k]; break; }
      }
      if (!containerFiber) throw new Error('no __reactContainer$ found on any root element');
      const fiberRoot = containerFiber.stateNode;
      const currentRoot = fiberRoot && fiberRoot.current ? fiberRoot.current : containerFiber;
      out.fiberTree = fiberRoot && fiberRoot.current ? 'committed' : 'container-fallback';

      let target = null;
      const stack = [currentRoot];
      let guard = 0;
      while (stack.length && guard < 50000) {
        guard += 1;
        const fr = stack.pop();
        if (!fr) continue;
        const n = fr.type && (fr.type.name || fr.type.displayName);
        if (n === 'JournalScreen') { target = fr; break; }
        if (fr.child) stack.push(fr.child);
        if (fr.sibling) stack.push(fr.sibling);
      }
      if (!target) throw new Error('JournalScreen fiber not found in the committed tree');

      // Serialize a hook value without touching React's circular internals.
      const safe = (v) => {
        if (v === null) return null;
        const t = typeof v;
        if (t === 'string' || t === 'number' || t === 'boolean') return v;
        if (t === 'undefined') return '<undefined>';
        if (t === 'function') return '<fn>';
        if (Array.isArray(v)) return `<array:${v.length}>`;
        if (t !== 'object') return '<?>';
        const keys = Object.keys(v);
        if (keys.includes('create') || keys.includes('deps') || keys.includes('tag')) return '<effect>';
        const flat = {};
        for (const k of keys) {
          const x = v[k];
          const tx = typeof x;
          if (x === null || tx === 'string' || tx === 'number' || tx === 'boolean') flat[k] = x;
          else return `<obj:${keys.join(',')}>`;
        }
        return flat;
      };

      const hooks = [];
      let h = target.memoizedState;
      for (let i = 0; h && i < 80; i += 1, h = h.next) hooks.push(safe(h.memoizedState));
      out.fiber = { hooks };
    } catch (e) {
      out.fiberError = String(e && e.message || e);
    }
    return out;
  });
}

/**
 * The expectation "the screen should show no selection at all".
 *
 * Save clears the composer (JournalScreen.tsx `handleSave`, 2026-09-17), so
 * after phase B the correct reading is nothing selected. Written as a string so
 * it survives into `sequence.json` and reads as itself in the report.
 */
const CLEARED = 'cleared';

/** One full reading, tagged, appended to the sequence. Never throws. */
async function probe(tag, expected = null) {
  const wall = currentWall;
  let state = null, err = null;
  try { state = await readState(); } catch (e) { err = String(e && e.message || e); }

  // Identify the moodEntry hook by shape the first time it is populated, then
  // keep reading that index — so a null reads as "moodEntry is null", not as
  // "could not find it".
  let moodEntry = null, moodEntrySource = 'unknown';
  if (state && state.fiber) {
    const hooks = state.fiber.hooks;
    if (moodHookIndex === null) {
      const idx = hooks.findIndex((v) => v && typeof v === 'object' && !Array.isArray(v)
        && Object.keys(v).length === 2 && typeof v.date === 'string' && typeof v.mood === 'string');
      if (idx >= 0) { moodHookIndex = idx; moodEntry = hooks[idx]; moodEntrySource = `hook[${idx}] (identified by shape)`; }
      else moodEntrySource = 'not yet identified — no {date,mood} hook present';
    } else {
      moodEntry = hooks[moodHookIndex] ?? null;
      moodEntrySource = `hook[${moodHookIndex}]`;
    }
  }

  const appToday = state ? state.appToday : null;
  const selectedMood = moodEntry && moodEntry.date === appToday ? moodEntry.mood : null;

  // A DAY HOLDS AS MANY ENTRIES AS THE PATIENT WROTE (schema v17, 2026-09-17).
  //
  // This used to read `rows[0]` of a `WHERE date = ?` and call it "the" row,
  // which was correct while `date` was UNIQUE and is now the first entry of the
  // day — the oldest, not the one a tap just produced. Every check below asks
  // about the newest, because Save appends and then clears the composer, so the
  // entry that corresponds to the tap being probed is the last one. `ORDER BY
  // id ASC` is the order the app itself lists a day in (`queries.ts:1081`).
  let rows = [], rowErr = null;
  try {
    rows = await sql('SELECT id, date, mood, note FROM journal_entries WHERE date = ? ORDER BY id ASC', [dayDate(currentDay)]);
  } catch (e) { rowErr = String(e && e.message || e); }
  const latest = rows.length ? rows[rows.length - 1] : null;

  // A probe taken in the same tick as the tap is READ BEFORE COMMIT by design —
  // React has not rendered yet, so a disagreement there says nothing about the
  // app. Only settled probes are allowed to constitute a finding. Without this
  // split the report would fire on every run regardless of the code, which is
  // the defect items 1.1 and 1.3 exist to remove from the 60-day harness.
  const authoritative = !tag.startsWith('immediately-');

  const entry = {
    seq: sequence.length + 1,
    day: currentDay,
    date: dayDate(currentDay),
    phase: currentPhase,
    tag,
    authoritative,
    wallClock: wall,
    expectedMood: expected,
    appToday,
    appTodayError: state ? state.appTodayError : null,
    moodEntry,
    moodEntrySource,
    selectedMood,
    // `CLEARED` is an expectation of "nothing selected", which is different from
    // `null` meaning "no expectation at all". Save now clears the composer, so
    // the probes after it expect an empty screen — passing the saved mood there
    // made every run report two mismatches a day for behaving correctly.
    matchesExpected: expected === null ? null
      : expected === CLEARED ? selectedMood === null
      : selectedMood === expected,
    fiberTree: state ? state.fiberTree : null,
    dbRows: rows,
    dbCount: rows.length,
    dbLatest: latest,
    dbError: rowErr,
    dom: state ? state.dom : null,
    fiberError: state ? state.fiberError : null,
    hooks: state && state.fiber ? state.fiber.hooks : null,
    probeError: err,
  };
  sequence.push(entry);
  return entry;
}

let currentWall = null;
async function setMoment(n, hhmm) {
  const d = at(n, hhmm);
  currentWall = d.toISOString();
  await page.clock.setFixedTime(d);
}

// ── onboarding (day 1 only) ──────────────────────────────────────────────────
/**
 * Advance one onboarding step, whatever this build calls the button.
 *
 * Tried in order, newest label first. Returns false only when none of them is
 * on screen — which is a real finding about the driver, not something to
 * swallow.
 */
const advanceOnboarding = async () => {
  for (const label of ['Continue', 'Next step', 'Weiter']) {
    if (await clickLabel(label)) return true;
  }
  return false;
};

async function onboard() {
  currentPhase = 'onboarding';
  if (!(await clickText('Not now'))) problems.push('notification primer "Not now" not found');
  await wait(1600);
  await page.getByPlaceholder('e.g. Alex').first().fill(PATIENT.name).catch(() => problems.push('name field missing'));
  // The weight field was removed from onboarding; only name and the D3 dose are
  // asked for now. Filling a placeholder that no longer exists was silent, which
  // is how the driver kept looking healthy while it was one step behind.
  await page.getByPlaceholder('e.g. 5000').first().fill(PATIENT.dailyIU).catch(() => {});
  await wait(400);
  // The advance button is labelled 'Continue' (i18n key `obContinue`); it was
  // 'Next step' when this was written. A failed click was IGNORED here, so the
  // run went on tapping at an onboarding screen it had never left and reported
  // nine downstream problems instead of the one real one.
  if (!(await advanceOnboarding())) problems.push('onboarding step 1 → 2: no Continue button fired');
  await wait(1500);
  if (!(await clickLabel('Select condition: Multiple Sclerosis'))) problems.push('condition card not selectable');
  await wait(800);
  if (!(await advanceOnboarding())) problems.push('onboarding step 2 → 3: no Continue button fired');
  await wait(1500);
  if (!(await clickLabel("Let's begin"))) problems.push('final onboarding button did not fire');
  await wait(8000);
  await shot('onboarded');
}

// ── one simulated day ────────────────────────────────────────────────────────
async function runDay(n) {
  currentDay = n;
  await setMoment(n, '07:30');

  if (n === 1) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await wait(9000);
    await onboard();
  } else {
    // A new day the way a phone meets one: the app was left open overnight and
    // is re-entered through the tab bar. No reload — a reload would remount the
    // screen and hide exactly the stale-state bug being hunted.
    await gotoTab('Today');
    await wait(1200);
  }

  currentPhase = 'start-day';
  await clickLabel('Dismiss wizard, start using the app').catch(() => {});
  await clickText("Got it, let's start").catch(() => {});
  await wait(600);
  await clickText('Start My Day').catch(() => {});
  await wait(3000);

  await gotoTab('Journal');
  await wait(1200);
  await shot('journal-open');

  // ── Phase A: five clean taps, nothing focused ──────────────────────────────
  // The plain question first: does tapping a mood put that mood into state?
  currentPhase = 'A-clean-taps';
  await probe('baseline-before-any-tap');
  for (const m of MOODS) {
    const clicked = await clickLabel(`Select mood ${m.label}`);
    if (!clicked) problems.push(`day ${n}: mood button "${m.label}" not clickable`);
    await probe(`immediately-after-tap-${m.label}`, m.emoji);
    await wait(900);
    await probe(`settled-after-tap-${m.label}`, m.emoji);
  }
  await shot('after-five-taps');

  // ── Phase B: Save ──────────────────────────────────────────────────────────
  // The last mood tapped in phase A is 😞 Struggling. That is what a user who
  // tapped five moods and pressed Save would expect to find stored.
  currentPhase = 'B-save';
  const last = MOODS[MOODS.length - 1];
  await probe('before-save', last.emoji);
  const savedClick = await clickLabel('Save journal entry');
  if (!savedClick) {
    // The Save button's accessibilityLabel flips to 'Journal entry saved' while
    // `saved` is true (JournalScreen.tsx:484). If a blur-autosave already fired,
    // the label a caller is waiting for is not the label on screen — which is
    // the "Journal Save button not found" finding, not a missing button.
    const alt = await clickLabel('Journal entry saved');
    problems.push(`day ${n}: 'Save journal entry' not found${alt ? " — 'Journal entry saved' was on screen instead (saved flag already true)" : ' and neither was "Journal entry saved"'}`);
  }
  // After Save the composer is empty, not still holding 😞 — the mood went into
  // an entry and the fields were cleared for the next one. Expecting the saved
  // mood here was the old row-editor behaviour.
  await probe('immediately-after-save', CLEARED);
  await wait(1600);
  await probe('settled-after-save', CLEARED);
  await shot('after-save');

  // ── Phase C: the blur race, on purpose ─────────────────────────────────────
  // handleBlur saves when a note field loses focus and a mood is set. Tapping a
  // mood while the note has focus fires blur-save with the PRE-tap mood in the
  // same gesture that sets the new one. Phase A deliberately avoided this;
  // here it is provoked, so the two paths can be told apart.
  currentPhase = 'C-blur-race';
  const noteBox = page.getByPlaceholder('How are you feeling today?').first();
  const haveNote = await noteBox.count().catch(() => 0);
  if (!haveNote) {
    problems.push(`day ${n}: note field (placeholder "How are you feeling today?") not found — blur race not exercised`);
  } else {
    await noteBox.click().catch(() => {});
    await noteBox.fill(`Day ${n}: typed before the mood tap.`).catch(() => {});
    await probe('note-focused-text-typed');
    // Tap a mood that differs from whatever is stored, while the note holds
    // focus. Blur and mood-select fire in the same gesture.
    const target = MOODS[1];   // 🙂 Good
    const clicked = await clickLabel(`Select mood ${target.label}`);
    if (!clicked) problems.push(`day ${n}: blur-race mood "${target.label}" not clickable`);
    await probe('immediately-after-tap-while-note-focused', target.emoji);
    await wait(1200);
    await probe('settled-after-blur-race', target.emoji);
    await shot('after-blur-race');
    // Leave WITHOUT pressing Save — that is the real user path this is about.
    await gotoTab('Today');
    await wait(800);
    await gotoTab('Journal');
    await wait(1400);
    await probe('after-leaving-and-returning-without-save', target.emoji);
    await shot('after-return');
  }

  return { day: n, date: dayDate(n) };
}

// ── run ──────────────────────────────────────────────────────────────────────
await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 240000 });
await wait(2500);

const days = [];
for (let n = 1; n <= DAYS; n += 1) {
  try { days.push(await runDay(n)); }
  catch (e) { problems.push(`day ${n} aborted: ${String(e && e.message || e).split('\n')[0]}`); }
}

// Final truth: every journal row the run produced.
let finalRows = [];
try { finalRows = await sql('SELECT id, date, mood, note FROM journal_entries ORDER BY date, id'); }
catch (e) { problems.push(`final journal_entries read failed: ${String(e && e.message || e)}`); }

await browser.close();

// ── derived checks ───────────────────────────────────────────────────────────
// Computed from the recorded sequence, not asserted live, so every one of them
// can be re-derived from sequence.json by anyone who doubts it. Both are
// falsifiable statements about a specific probe — they go quiet the moment the
// behaviour changes, which is the property items 1.1 and 1.3 are about.

// 1. A day with no stored entry must open with nothing selected. A mood showing
//    as selected before the first tap, on a date with NO entries at all, is
//    yesterday's mood carried across the day boundary. `dbCount === 0` rather
//    than `dbRow === null`: a day can now hold several entries, so "empty" is a
//    count, not a missing row.
const carryOver = sequence.filter((e) => e.tag === 'baseline-before-any-tap' && e.dbCount === 0 && e.selectedMood !== null);

// 2. The blur race must not write an entry nobody asked for.
//
//    REWRITTEN 2026-09-20, because v17 changed what this check means. It used to
//    read: a selection surviving a return to the screen that the stored row does
//    not have is a bug — true while the day had exactly one row that Save
//    rewrote in place. The editor is now a composer: Save appends a row and
//    clears the fields, and an unsaved draft is in-memory state the screen is
//    entitled to keep while it stays mounted. Left as it was, this check would
//    have fired on every single day of every run and called correct behaviour a
//    defect.
//
//    What is still falsifiable, and sharper: phase C types a note and taps a
//    mood while the note holds focus, then leaves WITHOUT pressing Save. The
//    day's entry count must be the same before and after. If it grew, `handleBlur`
//    silently appended an entry the user never saved — the same defect as the
//    original finding, in the shape the new schema gives it.
const phantomWrite = days.map((d) => {
  const before = sequence.find((e) => e.day === d.day && e.tag === 'settled-after-save');
  const after = sequence.find((e) => e.day === d.day && e.tag === 'after-leaving-and-returning-without-save');
  if (!before || !after || before.dbError || after.dbError) return null;
  return after.dbCount > before.dbCount ? { day: d.day, date: d.date, before: before.dbCount, after: after.dbCount, seq: after.seq, mood: after.dbLatest ? after.dbLatest.mood : null } : null;
}).filter(Boolean);

// 2b. Informational, not a finding: the draft the user never saved is still on
//     screen after leaving and coming back. Expected under the composer — it is
//     recorded so a run where it STOPS happening is visible too, because that
//     would mean a draft is being dropped on a tab switch.
const draftAfterReturn = sequence.filter((e) => e.tag === 'after-leaving-and-returning-without-save'
  && e.selectedMood !== null && (!e.dbLatest || e.dbLatest.mood !== e.selectedMood));

// ── output ───────────────────────────────────────────────────────────────────
await writeFile(join(OUT, 'sequence.json'), JSON.stringify({
  ranAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  simulatedDays: DAYS,
  simulatedStart: START,
  moodHookIndex,
  sequence,
  finalRows,
  checks: { carryOver, phantomWrite, draftAfterReturn },
  problems,
  console: consoleLog,
}, null, 2));

const short = (v) => v === null || v === undefined ? '—' : String(v);
/** An expectation cell: `CLEARED` reads as what it means, not as its sentinel. */
const want = (v) => v === CLEARED ? 'nothing selected' : short(v);
const moodCell = (e) => e.moodEntry ? `${e.moodEntry.mood} @ ${e.moodEntry.date}` : '—';
const okCell = (e) => e.matchesExpected === null ? '' : e.matchesExpected ? 'ok' : '**MISMATCH**';

// The day's entries as one cell: how many, and the newest one's mood. "2× 🙂"
// reads as two entries whose latest is 🙂; "—" is a day with nothing stored.
const dbCell = (e) => {
  if (e.dbError) return '**err**';
  if (!e.dbCount) return '—';
  return e.dbCount === 1 ? short(e.dbLatest.mood) : `${e.dbCount}× ${short(e.dbLatest.mood)}`;
};

const rows = sequence.map((e) => `| ${e.seq} | ${e.day} | ${e.phase} | ${e.tag} | ${want(e.expectedMood)} | ${short(e.selectedMood)} | ${okCell(e)} | ${moodCell(e)} | ${short(e.appToday)} | ${e.dom && e.dom.selectedByStyle && e.dom.selectedByStyle.length ? e.dom.selectedByStyle.join('+') : '—'} | ${e.dom && e.dom.save ? (e.dom.save.ariaDisabled === 'true' || e.dom.save.domDisabled ? 'disabled' : e.dom.save.text) : '—'} | ${dbCell(e)} |`);

const mismatches = sequence.filter((e) => e.matchesExpected === false && e.authoritative);
const preCommit = sequence.filter((e) => e.matchesExpected === false && !e.authoritative);

// Probe health: the fiber read and the painted DOM are independent views of the
// same value and must agree once a render has settled. When they do not, the
// instrument is suspect before the app is — say so in the report rather than
// letting a bad read be filed as a bug.
const domDisagrees = sequence.filter((e) => {
  if (!e.authoritative || !e.dom || !e.dom.selectedByStyle) return false;
  const painted = e.dom.selectedByStyle.length === 1
    ? (MOODS.find((m) => m.label === e.dom.selectedByStyle[0]) || {}).emoji ?? null
    : null;
  if (e.dom.selectedByStyle.length === 0 && e.selectedMood === null) return false;
  return painted !== e.selectedMood;
});
const perDay = days.map((d) => {
  // Every entry the day ended with, in the order the app lists them. One row
  // per day was the old schema's promise; printing only the first now hides
  // exactly the case this harness exists to watch — a second save that went
  // somewhere unexpected.
  const dayRows = finalRows.filter((r) => r.date === d.date);
  if (!dayRows.length) return `| ${d.day} | ${d.date} | 0 | **no entries** | — |`;
  const moods = dayRows.map((r) => r.mood).join(' ');
  const notes = dayRows.map((r) => (r.note ? `${String(r.note).length} ch` : '—')).join(' · ');
  return `| ${d.day} | ${d.date} | ${dayRows.length} | ${moods} | ${notes} |`;
});

const md = [
  `# Mood repro — ${DAYS} simulated days, ${MOODS.length} taps per day`,
  '',
  `Generated ${new Date().toISOString()} · PT-trio item 1.5 · ${sequence.length} probes · target ${BASE_URL}`,
  '',
  'Built for Lane 3 / item 3.2. Every row is one reading of four independent sources at one',
  'moment: the app\'s own `todayStr()`, the `moodEntry` hook read off the React fiber, the DOM,',
  'and the day\'s `journal_entries` rows. `selectedMood` is recomputed here the way',
  'JournalScreen.tsx:144 computes it, so a disagreement between the tap and the stored value is',
  'visible in one line.',
  '',
  '**A day holds several entries** (schema v17, 2026-09-17). Save appends a row and clears the',
  'composer rather than rewriting the day\'s one row, so the `entries` column reads `2× 🙂` —',
  'how many the day holds, and the mood of the newest. Every check below asks about the newest',
  'entry, because that is the one the probe\'s own tap produced.',
  '',
  `\`moodEntry\` was read from hook index **${moodHookIndex === null ? 'never identified' : moodHookIndex}** of the JournalScreen fiber.`,
  '',
  '## What persisted, per day',
  '',
  '| day | date | entries | moods stored, oldest first | notes |',
  '|---|---|---|---|---|',
  ...perDay,
  '',
  `Phase A taps all five moods in order and phase B saves, so each day should hold **one** entry, mood 😞 (Struggling) — the last mood phase A touches. Phase C then types a note and taps 🙂 while the note holds focus, and leaves without saving: under the composer that tap is a draft and must not become a second entry. A day showing two entries is check 2 firing, not a better day. _(This caption said the expected stored mood was 🙂 from 2026-09-13 until 2026-09-20. That was right while Save rewrote the day's one row and phase C's blur-save landed on it last; under v17 the same behaviour would be an unasked-for extra row, which is why the number of entries is now the thing being read and not just the mood.)_`,
  '',
  `## Findings — ${mismatches.length} of ${sequence.filter((e) => e.matchesExpected !== null && e.authoritative).length} settled probes`,
  '',
  'Settled probes only. A reading taken in the same tick as the tap is a read-before-commit by',
  'construction and cannot constitute a finding; those are listed separately below.',
  '',
  ...(mismatches.length
    ? ['| seq | day | phase | tag | expected | actual selectedMood | moodEntry | appToday |',
       '|---|---|---|---|---|---|---|---|',
       ...mismatches.map((e) => `| ${e.seq} | ${e.day} | ${e.phase} | ${e.tag} | ${want(e.expectedMood)} | ${short(e.selectedMood)} | ${moodCell(e)} | ${short(e.appToday)} |`)]
    : ['None — every tap landed in state and survived to the settled read.']),
  '',
  `### Pre-commit reads (informational, not findings) — ${preCommit.length}`,
  '',
  ...(preCommit.length
    ? preCommit.map((e) => `- seq ${e.seq}, day ${e.day}, \`${e.tag}\`: wanted ${want(e.expectedMood)}, read ${short(e.selectedMood)} — React had not committed yet.`)
    : ['None.']),
  '',
  `### Probe health — fiber vs painted DOM disagreements on settled probes: ${domDisagrees.length}`,
  '',
  ...(domDisagrees.length
    ? ['**The instrument is suspect, not the app.** These two views of `selectedMood` are independent and',
       'must agree once a render settles. Investigate the probe before filing anything from this run.',
       '',
       ...domDisagrees.map((e) => `- seq ${e.seq}, day ${e.day}, \`${e.tag}\`: fiber says ${short(e.selectedMood)}, DOM paints ${e.dom.selectedByStyle.join('+') || 'nothing'} (fiber tree: ${short(e.fiberTree)}).`)]
    : ['None — the fiber read and the painted selection agree on every settled probe.']),
  '',
  `## Check 1 — day opens with yesterday's mood still selected: ${carryOver.length} day(s)`,
  '',
  ...(carryOver.length
    ? ['A day that holds no entries at all is showing a mood as already selected, and',
       '`moodEntry.date` has been rewritten to the new date. Save is enabled before the user has',
       'touched anything, so the carried mood is what gets stored if they press it or blur a note field.',
       '',
       '| seq | day | date | selectedMood at open | moodEntry | entries for that date |',
       '|---|---|---|---|---|---|',
       ...carryOver.map((e) => `| ${e.seq} | ${e.day} | ${e.date} | ${short(e.selectedMood)} | ${moodCell(e)} | ${e.dbCount ? dbCell(e) : '**none**'} |`),
       '',
       'Suspect `JournalScreen.tsx:113` — the effect returns early only when `moodEntry?.date === today`,',
       'and on a new day it instead writes `{date: today, mood: loadedMood}` with a `loadedMood` that',
       'still belongs to the previous day. Lane 3 owns the file; this is evidence, not a fix.']
    : ['None — every day opened with nothing selected.']),
  '',
  `## Check 2 — the blur race wrote an entry nobody saved: ${phantomWrite.length} day(s)`,
  '',
  ...(phantomWrite.length
    ? ['Phase C typed a note, tapped a mood while the note held focus, and left the screen WITHOUT',
       'pressing Save. The day gained an entry anyway — `handleBlur` (JournalScreen.tsx:167) saved on',
       'focus loss. Under the composer that is no longer an overwrite, it is an extra row in the',
       'patient\'s day that they never wrote.',
       '',
       '| seq | day | date | entries before | entries after | newest mood |',
       '|---|---|---|---|---|---|',
       ...phantomWrite.map((p) => `| ${p.seq} | ${p.day} | ${p.date} | ${p.before} | ${p.after} | ${short(p.mood)} |`)]
    : ['None — the entry count was unchanged across the blur race on every day.']),
  '',
  `### Unsaved draft still on screen after returning (expected, informational): ${draftAfterReturn.length}`,
  '',
  ...(draftAfterReturn.length
    ? ['The composer kept an unsaved mood across a tab switch, which is what it is supposed to do —',
       'the screen stays mounted and the draft is in-memory state. Listed so that a run where this',
       'stops happening is visible, because that would mean drafts are being dropped.',
       '',
       ...draftAfterReturn.map((e) => `- seq ${e.seq}, day ${e.day}: draft ${short(e.selectedMood)} on screen, newest stored ${e.dbLatest ? short(e.dbLatest.mood) : '**none**'} (${e.dbCount} entr${e.dbCount === 1 ? 'y' : 'ies'} that day).`)]
    : ['None — no draft survived the return.']),
  '',
  '## Full sequence',
  '',
  '| # | day | phase | tag | want | selectedMood | | moodEntry | appToday | DOM selected | Save | entries |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows,
  '',
  ...(problems.length ? ['## Driver problems', '', ...problems.map((p) => `- ${p}`), ''] : []),
  '## Reading this',
  '',
  '- `moodEntry` blank with a mismatch means the tap never reached `handleMoodSelect` — a delivery problem.',
  '- `moodEntry` holding the right mood but a *different* date than `appToday` means the tap landed and the',
  '  derivation at JournalScreen.tsx:144 then discarded it — a date problem, not a tap problem.',
  '- `DOM selected` disagreeing with `selectedMood` means the screen is painting a selection the derived',
  '  value does not have (or vice versa) — a render-timing problem.',
  '- Phase C rows are the deliberate blur race. A phase-C mismatch that phase A does not show puts the cause',
  '  in `handleBlur`, not in the tap path.',
  '',
  `Raw: \`sequence.json\` (every probe, every hook value, the full console) · \`shots/\` (${shotIdx} screenshots).`,
].join('\n');

await writeFile(join(OUT, 'mood3.md'), md);

// H7: the summary line used to report only settled-read findings, so a run with
// Check 1 = 2 printed exactly the same line as a run with Check 1 = 0. That is
// why cb8f2ba's commit message records "reported 0 findings, so the probe as I
// invoked it is not a signal either way" — the probe WAS signalling, in the
// report body, and the headline said nothing. Same class as item 1.4: a
// reporting defect that makes a run look clean.
//
// Both checks are in the line now, and a run that finds anything exits non-zero
// so a caller cannot mistake it for a pass.
// `draftAfterReturn` is deliberately NOT in the total: under the composer it is
// expected behaviour, and counting it would fail every clean run.
const checkTotal = carryOver.length + phantomWrite.length;
process.stderr.write(`\n${sequence.length} probes · Check 1 (carry-over): ${carryOver.length} · Check 2 (unsaved write): ${phantomWrite.length} · drafts kept across a return: ${draftAfterReturn.length} (expected) · ${mismatches.length} finding(s) on settled reads · ${preCommit.length} pre-commit · ${domDisagrees.length} probe-health warning(s) → ${join(OUT, 'mood3.md')}\n`);
if (problems.length) process.stderr.write(`${problems.length} driver problem(s) — see the report\n`);
const failed = checkTotal + mismatches.length + problems.length;
if (failed) process.stderr.write(`FAIL: ${failed} problem(s)\n`);
else process.stderr.write('PASS: no checks fired\n');
process.exit(failed ? 1 : 0);
