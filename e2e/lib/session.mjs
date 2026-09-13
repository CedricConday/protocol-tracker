// Playwright session helpers for driving the Expo *web* build of Protocol Tracker.
// The web target is a stand-in for the device: it exercises the same React tree,
// the same SQLite schema (expo-sqlite runs on wa-sqlite here) and the same
// navigation, so UI logic bugs surface without a phone in the loop.
import { chromium } from '/home/ubuntu/.npm/_npx/705bc6b22212b352/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const BASE_URL = process.env.PT_E2E_URL || 'http://localhost:8085';
export const SHOT_DIR = process.env.PT_E2E_SHOTS || 'e2e/report/shots';

// Web-only noise: these come from native modules that have no web implementation
// and say nothing about the app's real behaviour on a device.
const IGNORED_CONSOLE = [
  /not (yet )?(fully )?(available|supported) on web/i,
  /React DevTools/i,
  /useNativeDriver/i,
  /"shadow\*" style props are deprecated/i,
  /Require cycle/i,
  /Development-level warnings/i,
];

const isNoise = (text) => IGNORED_CONSOLE.some((re) => re.test(text));

// ── Native stub: expo-notifications' scheduler ────────────────────────────────
// `Notifications.getAllScheduledNotificationsAsync()` has no web implementation
// and throws UnavailabilityError. On a device it returns a list. Because
// `startDay()` awaits a helper that rethrows that error (see the audit), the
// whole active-day surface is unreachable on web without a stub — every dose
// row, the water and sun trackers, the day's compliance numbers.
//
// So flows can opt in with `session: { stubNotificationScheduler: true }`, which
// rewrites exactly one branch of the served dev bundle to return `[]` instead of
// throwing — the same shape the device returns when nothing is scheduled. This
// stubs the *native module*, never app code. `home.mjs` deliberately runs
// WITHOUT the stub so the real failure still gets caught and reported.
const SCHEDULER_THROW = `if (!NotificationScheduler.default.getAllScheduledNotificationsAsync) {
      throw new _expoModulesCore.UnavailabilityError('Notifications', 'getAllScheduledNotificationsAsync');
    }`;
const SCHEDULER_STUB = `if (!NotificationScheduler.default.getAllScheduledNotificationsAsync) {
      return [];
    }`;

async function installNotificationSchedulerStub(page) {
  await page.route(/\.bundle(\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (!body.includes(SCHEDULER_THROW)) {
      // Bundle shape changed — pass it through untouched rather than guess.
      await route.fulfill({ response, body });
      return;
    }
    await route.fulfill({ response, body: body.replace(SCHEDULER_THROW, SCHEDULER_STUB) });
  });
}

export async function openApp({ label = 'flow', stubNotificationScheduler = false } = {}) {
  const browser = await chromium.launch();
  // A fresh context each run means a fresh origin storage bucket, so the app
  // starts at onboarding with an empty database every time.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  if (stubNotificationScheduler) await installNotificationSchedulerStub(page);

  const errors = [];
  const console_ = [];
  page.on('console', (m) => {
    const text = `${m.text()}`;
    console_.push({ type: m.type(), text });
    if ((m.type() === 'error' || m.type() === 'warning') && !isNoise(text)) {
      errors.push({ kind: `console.${m.type()}`, text });
    }
  });
  page.on('pageerror', (e) => {
    if (!isNoise(e.message)) errors.push({ kind: 'pageerror', text: e.message });
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 240000 });
  await page.waitForTimeout(2000); // db boot

  await mkdir(SHOT_DIR, { recursive: true });
  let shotIndex = 0;
  const shots = [];

  const ctx = {
    page,
    errors,
    console: console_,
    label,

    async shot(name) {
      shotIndex += 1;
      const file = join(SHOT_DIR, `${label}-${String(shotIndex).padStart(2, '0')}-${name}.png`);
      await page.screenshot({ path: file });
      shots.push(file);
      return file;
    },

    // RN Web renders TouchableOpacity as a div; matching on the visible label is
    // the only stable handle we have without adding testIDs everywhere.
    async tap(text, { exact = false, timeout = 8000 } = {}) {
      const target = page.getByText(text, { exact }).first();
      await target.waitFor({ state: 'visible', timeout });
      await target.click();
      await page.waitForTimeout(600);
    },

    async fill(placeholder, value) {
      const input = page.getByPlaceholder(placeholder).first();
      await input.waitFor({ state: 'visible', timeout: 8000 });
      await input.fill(value);
      await page.waitForTimeout(200);
    },

    async text() {
      return page.innerText('body');
    },

    async sees(needle) {
      return (await page.innerText('body')).includes(needle);
    },

    shots,
  };

  ctx.close = async () => {
    await browser.close();
  };

  return ctx;
}

export async function writeJson(path, data) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}
