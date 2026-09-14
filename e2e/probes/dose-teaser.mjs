// "It always say 3 no matter what." Prove the teaser follows what is left.
import { openApp } from '../lib/session.mjs';
import { onboard, startDay, gotoTab, screenText } from '../lib/prelude.mjs';

const ctx = await openApp({ label: 'stack', stubNotificationScheduler: true });
const { page } = ctx;
const call = (fn, ...args) => page.evaluate(async ({ fn, args }) => {
  const m = window.__r(window.__PT_MODS['src/db/queries.ts']);
  return m[fn](...args);
}, { fn, args });

await onboard(ctx);
// Three more supplements so the day has four doses, like Cedric's screenshot.
for (const name of ['Magnesium', 'Vitamin K2', 'Zinc']) {
  await call('addSupplement', { name, form: 'capsule', dose_amount: '1', dose_unit: 'cap', offset_minutes: 0, with_food: false, tolerance_window: 30 });
}
await startDay(ctx);
await page.waitForTimeout(2500);
await gotoTab(ctx, 'Today');
await page.waitForTimeout(1200);

const label = async () => {
  const line = (await screenText(ctx)).split('\n').find((l) => /tap to view all|doses left|view today/i.test(l));
  return line ? line.trim() : '(no teaser)';
};
const rows = async () => call('getTodayDoses');

console.log('4 doses, none taken :', await label());

const doses = await page.evaluate(async () => {
  const m = window.__r(window.__PT_MODS['src/db/queries.ts']);
  const db = await (await import('/dev/null').catch(() => ({}))) ;
  return null;
}).catch(() => null);

// Take doses one at a time straight through the data layer, reloading Today.
const ids = await ctx.sql("SELECT id FROM dose_logs WHERE date = date('now','localtime') ORDER BY scheduled_time");
for (let i = 0; i < ids.length; i++) {
  await call('confirmDose', ids[i].id);
  await gotoTab(ctx, 'Journal');
  await page.waitForTimeout(500);
  await gotoTab(ctx, 'Today');
  await page.waitForTimeout(1200);
  console.log(`after ${i + 1} taken     :`, await label());
}
await ctx.close();
