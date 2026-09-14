// thirtyday.mjs — one headless pass that simulates 30 days of real use and
// audits every screen it touches.
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
const OUT = 'e2e/report/thirtyday';
const SHOTS = join(OUT, 'shots');
const START = '2026-07-01';
const TOTAL_DAYS = Number(process.env.PT_DAYS || process.argv[process.argv.indexOf('--days') + 1]) || 30;

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
const SKIPPED = new Set([7, 15, 23]);              // never opened the app
const PARTIAL = new Set([4, 9, 12, 18, 26]);       // started, drifted off
const RESCHEDULE_DAY = 11;                          // move a dose's offset
const TZ_CROSS_DAY = 20;                            // operated just after local midnight
const MAX_DAY = 25;                                 // every field pushed to its ceiling
const EMPTY_DAY = 28;                               // every field submitted blank
const DEEP_SWEEP_DAY = 14;                          // walk the Settings sub-screens
const LOG_EVENT_EVERY = 4;                          // cadence for exercising the absorbed +Log Event panel
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
  if (n === TZ_CROSS_DAY) return { shape: 'timezone-crossing' };
  if (n === MAX_DAY) return { shape: 'max-values' };
  if (n === EMPTY_DAY) return { shape: 'empty-values' };
  if (PARTIAL.has(n)) return { shape: 'partial' };
  if (n === RESCHEDULE_DAY) return { shape: 'reschedule' };
  return { shape: 'full' };
}

// ── findings ─────────────────────────────────────────────────────────────────
const findings = [];
let currentDay = 0;
let currentScreen = 'boot';
const screensHit = new Set();
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

// ── layout audit ─────────────────────────────────────────────────────────────
/** Elements whose painted box escapes the 390px viewport, and text that renders
 *  as a raw i18n key. Measured from the box model, never eyeballed. */
async function auditScreen(name) {
  currentScreen = name;
  screensHit.add(name);
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
  const ok = await page.evaluate((href) => {
    // Path only: a tab's href carries its nested route once you have been into
    // the stack (`/Summary?screen=Report`), so an exact selector misses.
    const path = (a) => (a.getAttribute('href') || '').split(/[?#]/)[0];
    const hit = [...document.querySelectorAll('a[role="tab"]')]
      .find((a) => path(a) === href || path(a).startsWith(href + '/'));
    if (!hit) return false;
    hit.click();
    return true;
  }, TAB_HREF[label]);
  if (!ok) { note('high', 'tabbar', `Tab "${label}" not clickable`, 'any screen', 'src/navigation/index.tsx'); return false; }
  await wait(1400);
  currentScreen = label;
  screensHit.add(label);
  return true;
}

// Water and sun were logged from Today until 2026-09-13; both moved to their own
// screens under Trackers. Same components, same accessible names — only the
// route changed.
async function gotoTracker(name) {
  if (!(await gotoTab('Trackers'))) return false;
  await wait(600);
  const opened = await page.evaluate((n) => {
    const el = [...document.querySelectorAll('[aria-label]')]
      .find((e) => (e.getAttribute('aria-label') || '').startsWith(`${n} tracker`));
    if (!el) return false;
    el.click();
    return true;
  }, name);
  if (!opened) {
    note('high', 'Trackers', `No ${name} card on the Trackers tab — ${name} cannot be logged`, `day ${currentDay}`, 'src/screens/SummaryScreen.tsx');
    return false;
  }
  await wait(1400);
  currentScreen = name;
  screensHit.add(name);
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
  await page.getByPlaceholder('e.g. Alex').first().fill('Cedric');
  await page.getByPlaceholder('e.g. 70').first().fill('72');
  await page.getByPlaceholder('e.g. 5000').first().fill('10000');
  await wait(400);
  await shot('profile-filled');
  await clickLabel('Continue'); await wait(1500);
  await auditScreen('onboarding/condition');
  if (!(await clickLabel('Select condition: Multiple Sclerosis'))) {
    note('high', 'onboarding', 'Condition card not selectable', 'onboarding step 2', 'src/screens/OnboardingScreen.tsx:223');
  }
  await wait(800);
  await shot('condition');
  await clickLabel('Continue'); await wait(1500);
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
    // DoseDetailModal.tsx:160 / :166 — "✓ Took it" and the translated "Skip".
    const takeLabel = plan.shape === 'max-values' ? 'Skip' : 'Took it';
    const acted = await clickText(takeLabel);
    if (!acted) {
      note('medium', 'DoseDetailModal', `No control matching "${takeLabel}" in the dose sheet — dose cannot be logged`,
        `day ${n}: Today > expand doses > tap a dose`, 'src/components/DoseDetailModal.tsx');
    }
    await wait(1400);
    await shot('dose-acted');
    await clickText('Collapse').catch(() => {});
  });

  // ── supplements: water + sun ───────────────────────────────────────────────
  await step('water', async () => {
    const taps = plan.shape === 'max-values' ? 14 : plan.shape === 'partial' ? 1 : 4;
    if (!(await gotoTracker('Water'))) return;
    for (let i = 0; i < taps; i++) { await clickText('+ 250 ml'); await wait(260); }
    await shot('water');
  });
  await step('sun', async () => {
    if (plan.shape === 'partial') { await gotoTab('Today'); return; }
    const btn = plan.shape === 'max-values' ? '+30' : '+20';
    const reps = plan.shape === 'max-values' ? 6 : 1;
    if (!(await gotoTracker('Sunlight'))) return;
    for (let i = 0; i < reps; i++) { await clickText(btn); await wait(300); }
    await shot('sun');
    // Back to Today: the rest of the day's steps assume it.
    await gotoTab('Today');
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
    const inputs = await page.$$('input,textarea');
    if (!inputs.length) {
      note('medium', 'Journal', 'Journal offers no text input', `day ${n}`, 'src/screens/JournalScreen.tsx');
    } else {
      const body = plan.shape === 'max-values' ? 'X'.repeat(5000) : `Day ${n}: steady, no side effects.`;
      await inputs[inputs.length - 1].fill(body).catch(() => {});
    }
    // Mood buttons carry `Select mood <label>` (JournalScreen.tsx:162); vary the
    // mood by day so the Journal mood strip has something to plot.
    const MOOD_LABELS = ['Great', 'Good', 'Okay', 'Rough', 'Struggling'];
    const wantMood = MOOD_LABELS[n % MOOD_LABELS.length];
    if (!(await clickLabel(`Select mood ${wantMood}`))) {
      note('low', 'Journal', `Mood button "${wantMood}" not selectable`, `day ${n}`, 'src/screens/JournalScreen.tsx:162');
    }
    await wait(400);
    if (!(await clickLabel('Save journal entry'))) {
      note('medium', 'Journal', 'Save button not found on Journal', `day ${n}`, 'src/screens/JournalScreen.tsx:207');
    }
    await wait(1400);
    await shot('journal-saved');

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
  const backSteps = Math.min(30, lastSimulatedDay - 1);
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

// Day keys must all be local calendar dates. A row whose date is the day before
// the day it was written on is the toISOString() drift.
await step('day-key drift check', async () => {
  const tzDate = dayDate(TZ_CROSS_DAY);
  const prev = dayDate(TZ_CROSS_DAY - 1);
  const suspects = [];
  for (const [t, rows] of Object.entries(tables)) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      if (r && typeof r.date === 'string' && r.date === prev) suspects.push(`${t}.date=${r.date}`);
    }
  }
  if (suspects.length) {
    note('high', 'Today (timezone-crossing)',
      `Rows written just after local midnight on ${tzDate} were stored under ${prev} — the day key came from UTC, not the local calendar date. Affected: ${[...new Set(suspects)].join(', ')}`,
      `set the device clock to ${tzDate} 00:20 Europe/Berlin, log exercise and a meal from Today`,
      'src/screens/HomeScreen.tsx:260 / :275 (new Date().toISOString().split("T")[0])');
  }
});

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
  plan: { skipped: [...SKIPPED], partial: [...PARTIAL], reschedule: RESCHEDULE_DAY, timezoneCrossing: TZ_CROSS_DAY, maxValues: MAX_DAY, emptyValues: EMPTY_DAY },
  days,
  tables,
};
await writeFile(join(OUT, 'data.json'), JSON.stringify(dataJson, null, 2));
await writeFile(join(OUT, 'console.json'), JSON.stringify(consoleLog.filter((c) => c.type !== 'log'), null, 2));

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
const suspected = deduped.filter((f) => !certain.includes(f));

const row = (f) => `| ${f.severity} | ${f.screen} | ${f.what.replace(/\|/g, '\\|')} | ${f.repro.replace(/\|/g, '\\|')} | ${f.cause || '—'} |`;
const md = [
  '# Protocol Tracker — 30-day simulation audit',
  '',
  `Generated ${new Date().toISOString()} · ${days.length} simulated days from ${START} (Europe/Berlin) · ${screensHit.size} distinct screens.`,
  '',
  `Clock seam: **none in app source** — driven via Playwright \`clock.setFixedTime\`, which replaces \`Date\`/\`Date.now\` in the page and leaves timers real. No app code was modified for this run.`,
  '',
  `Counts: ${certain.length} certain · ${suspected.length} suspected · ${findings.length} raw observations before dedupe.`,
  '',
  '## Certain',
  '',
  '| severity | screen | what breaks | repro step | likely cause |',
  '| --- | --- | --- | --- | --- |',
  ...certain.map(row),
  '',
  '## Suspected',
  '',
  '| severity | screen | what breaks | repro step | likely cause |',
  '| --- | --- | --- | --- | --- |',
  ...suspected.map(row),
  '',
  '## Coverage',
  '',
  `Screens: ${[...screensHit].sort().join(', ')}`,
  '',
  `Day shapes: ${days.map((d) => `${d.day}:${d.shape}`).join(', ')}`,
  '',
].join('\n');
await writeFile(join(OUT, 'audit.md'), md);

log(`\n${days.length} days · ${screensHit.size} screens · ${certain.length} certain / ${suspected.length} suspected → ${join(OUT, 'audit.md')}`);
await browser.close();
