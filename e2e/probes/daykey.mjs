// Negative control for PT-trio B3. Not part of e2e/ — a throwaway proof that
// the rewritten day-key check can BOTH pass and fail, which is the one thing
// the check it replaces could not do.
//
// 1. Onboard with the clock at 00:20 local on a Europe/Berlin day, so local and
//    UTC dates disagree.
// 2. Take the rowid high-water mark the way runDay does.
// 3. Run a day's writes.
// 4. Evaluate the same predicate -> expect NO drift (the app uses localDateStr).
// 5. Inject one row dated to the UTC day and evaluate again -> expect drift.
import { openApp } from '../lib/session.mjs';
import { onboard, startDay, gotoTab } from '../lib/prelude.mjs';

const LOCAL_DAY = '2026-06-15';           // CEST, so 00:20 local = 22:20 UTC on the 14th
const PREV = '2026-06-14';

const ctx = await openApp({ label: 'daykey', stubNotificationScheduler: true });
const { page } = ctx;

await page.clock.install({ time: new Date(`${LOCAL_DAY}T00:20:00+02:00`) });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

const dateTables = async () => {
  const names = await ctx.sql("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  const out = [];
  for (const { name } of names) {
    const cols = await ctx.sql(`PRAGMA table_info("${name}")`);
    if (cols.some((c) => c.name === 'date')) out.push(name);
  }
  return out;
};
const highWater = async () => {
  const mark = {};
  for (const name of await dateTables()) {
    const r = await ctx.sql(`SELECT COALESCE(MAX(rowid), 0) AS hi FROM "${name}"`);
    mark[name] = Number(r[0]?.hi ?? 0);
  }
  return mark;
};
const evaluate = async (mark) => {
  const drifted = [], written = [];
  for (const [name, hi] of Object.entries(mark)) {
    const rows = await ctx.sql(`SELECT rowid AS rid, date FROM "${name}" WHERE rowid > ?`, [hi]);
    for (const r of rows) {
      if (typeof r.date !== 'string') continue;
      written.push(`${name}#${r.rid}=${r.date}`);
      if (r.date !== LOCAL_DAY) drifted.push(`${name}#${r.rid}.date=${r.date}`);
    }
  }
  return { drifted, written };
};

await onboard(ctx);
console.log('browser sees local date as:', await page.evaluate(() => new Date().toString()));
console.log('browser toISOString day :', await page.evaluate(() => new Date().toISOString().split('T')[0]));

const tables = await dateTables();
console.log('date-bearing tables     :', tables.join(', '));

const mark = await highWater();
console.log('high-water mark         :', JSON.stringify(mark));

// A day's worth of writes.
await startDay(ctx);
await page.waitForTimeout(2500);
const water = page.getByText('+ 250 ml').first();
if (await water.count()) { await water.click({ force: true }); await page.waitForTimeout(1200); }
const sun = page.getByText('+20', { exact: true }).first();
if (await sun.count()) { await sun.click({ force: true }); await page.waitForTimeout(1200); }
await gotoTab(ctx, 'Journal');
await page.waitForTimeout(1200);
const mood = page.locator('[aria-label]').filter({ hasText: '' });
await page.evaluate(() => {
  const el = [...document.querySelectorAll('[aria-label]')].find((e) => /mood/i.test(e.getAttribute('aria-label') || ''));
  if (el) el.click();
});
await page.waitForTimeout(1500);
await gotoTab(ctx, 'Today');
await page.waitForTimeout(1000);

const pass1 = await evaluate(mark);
console.log('\n--- PASS 1: the app as it is ---');
console.log('rows written in window  :', pass1.written.join(', ') || '(none)');
console.log('drifted                 :', pass1.drifted.join(', ') || '(none)');
console.log(pass1.drifted.length === 0 ? 'RESULT: no drift -> check PASSES' : 'RESULT: drift -> check FAILS');

// --- negative control: write one row the way a UTC day key would ---
const withRows = []; for (const t of tables) { const c = await ctx.sql(`SELECT COUNT(*) AS n FROM "${t}"`); if (Number(c[0].n) > 0) withRows.push(t); } const victim = withRows[0];
const cols = await ctx.sql(`PRAGMA table_info("${victim}")`);
const colNames = cols.map((c) => c.name).filter((c) => c !== 'id');
const row = await ctx.sql(`SELECT ${colNames.map((c) => `"${c}"`).join(', ')} FROM "${victim}" ORDER BY rowid DESC LIMIT 1`);
if (row.length) {
  const values = colNames.map((c) => (c === 'date' ? PREV : row[0][c]));
  await page.evaluate(async ({ victim, colNames, values }) => {
    const id = window.__PT_MODS['src/db/schema.ts'];
    const db = await window.__r(id).getDb();
    await db.runAsync(
      `INSERT INTO "${victim}" (${colNames.map((c) => `"${c}"`).join(', ')}) VALUES (${colNames.map(() => '?').join(', ')})`,
      values
    );
  }, { victim, colNames, values });
  const pass2 = await evaluate(mark);
  console.log(`\n--- PASS 2: one ${victim} row injected with date=${PREV} (what a UTC day key produces) ---`);
  console.log('drifted                 :', pass2.drifted.join(', ') || '(none)');
  console.log(pass2.drifted.length > 0 ? 'RESULT: drift detected -> check FAILS, as it must' : 'RESULT: MISSED IT -> the check is still blind');
} else {
  console.log(`\n--- PASS 2 skipped: no existing row in ${victim} to clone ---`);
}

await ctx.close();
