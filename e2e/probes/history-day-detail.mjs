// The History day sheet must show every tracker the grid claims for that day.
//
// Before this, getDayDetail returned doses, journal and events only, so a day
// the grid marked with the water dot opened onto a sheet with no water on it —
// and a day holding only a meal, a walk or some sun was not openable at all.
import { openApp } from '../lib/session.mjs';
import { gotoTab, screenText } from '../lib/prelude.mjs';

const ctx = await openApp({ label: 'history-day-detail', stubNotificationScheduler: true });
const call = (fn, ...args) => ctx.page.evaluate(async ({ fn, args }) => {
  const m = window.__r(window.__PT_MODS['src/db/queries.ts']);
  return m[fn](...args);
}, { fn, args });

// Skip the onboarding UI: this probe is about History, and a profile row is
// all the app's onboarding gate actually checks for.
await ctx.page.evaluate(async () => {
  const seed = window.__r(window.__PT_MODS['src/db/seed.ts']);
  await seed.createDefaultProfile('Testuser');
});
await ctx.page.reload({ waitUntil: 'networkidle' });
await ctx.page.waitForTimeout(2500);

// Yesterday, keyed the way the app keys days (device-local, not UTC).
const d = new Date();
d.setDate(d.getDate() - 1);
const pad = (n) => String(n).padStart(2, '0');
const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayNum = String(d.getDate());
console.log('seeding', date);

await call('addWater', 500, date);
await call('addWater', 250, date);
await call('logMeal', date, 'breakfast', '08:15');
await call('logExercise', 40, 'walk', date, 'moderate');
await call('logSunExposure', 25, 'Balcony', undefined, date);

console.log('getDayDetail:', JSON.stringify(await call('getDayDetail', date), null, 0).slice(0, 600));

// The notification-permission card sits in front of the tab bar on first load.
if (await ctx.sees('Stay on Track')) {
  await ctx.tap('Not now');
  await ctx.page.waitForTimeout(1200);
}
await gotoTab(ctx, 'History');
await ctx.page.waitForTimeout(1800);

// Open that day on the grid.
const cell = ctx.page.getByLabel(new RegExp(`^${date}[,.]`)).first();
if (!(await cell.count())) { console.log('FAIL: no openable cell for', date); await ctx.close(); process.exit(1); }
console.log('cell label:', await cell.getAttribute('aria-label'));
await cell.click();
await ctx.page.waitForTimeout(1500);

const sheet = await screenText(ctx);
console.log('--- sheet ---\n' + sheet.split('\n').filter(Boolean).slice(0, 40).join('\n'));

const checks = [
  ['water total',   /750 ml|0\.8 L/],
  ['water entries', /500 ml/],
  ['meals',         /Breakfast/i],
  ['exercise',      /40 min walk/i],
  ['sun',           /25 min/],
  ['sun note',      /Balcony/],
];
let bad = 0;
for (const [label, re] of checks) {
  const ok = re.test(sheet);
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
}
console.log(bad === 0 ? 'PASS: day sheet shows all four trackers' : `FAIL: ${bad} missing`);
await ctx.shot('history-day-detail').catch(() => {});

// The scrim above the card must dismiss the sheet, not just the Close button.
const inSheet = (txt) => /Sun Exposure/.test(txt);
console.log('sheet open before scrim tap:', inSheet(await screenText(ctx)));
const box = await ctx.page.viewportSize();
await ctx.page.mouse.click(Math.round(box.width / 2), 40);   // well above the card
await ctx.page.waitForTimeout(1200);
const afterScrim = await screenText(ctx);
console.log(inSheet(afterScrim) ? 'FAIL: scrim tap did not close the day sheet'
                                : 'PASS: scrim tap closed the day sheet');

// And a tap inside the card must NOT close it.
await cell.click();
await ctx.page.waitForTimeout(1200);
const title = ctx.page.getByText(/Sun Exposure/).first();
await title.click().catch(() => {});
await ctx.page.waitForTimeout(900);
console.log(inSheet(await screenText(ctx)) ? 'PASS: tap inside the card keeps it open'
                                           : 'FAIL: tap inside the card closed it');
await ctx.close();
