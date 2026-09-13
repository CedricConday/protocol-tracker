// H12: a goal set on the Water screen must be the goal Today shows.
import { openApp } from '../lib/session.mjs';
import { onboard, gotoTab, startDay, screenText } from '../lib/prelude.mjs';

const ctx = await openApp({ label: 'goal', stubNotificationScheduler: true });
const call = (fn, ...args) => ctx.page.evaluate(async ({ fn, args }) => {
  const m = window.__r(window.__PT_MODS['src/db/queries.ts']);
  return m[fn](...args);
}, { fn, args });

await onboard(ctx);
await startDay(ctx);
await ctx.page.waitForTimeout(2500);

const before = await screenText(ctx);
console.log('Today goal before:', (before.match(/goal [^\n]*/) ?? ['(none)'])[0]);

await call('setMiscFlag', 'water_goal_ml', '3200');
console.log('getWaterProgress :', JSON.stringify(await call('getWaterProgress')));

// Leave and come back so Today reloads.
await gotoTab(ctx, 'Journal');
await ctx.page.waitForTimeout(900);
await gotoTab(ctx, 'Today');
await ctx.page.waitForTimeout(1800);

const after = await screenText(ctx);
const line = (after.match(/goal [^\n]*/) ?? ['(none)'])[0];
console.log('Today goal after :', line);
console.log(/3\.2\s*L|3200/.test(line) ? 'PASS: Today follows the goal' : 'FAIL: Today still shows the old goal');
await ctx.close();
