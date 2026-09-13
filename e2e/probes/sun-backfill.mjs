// Does the sun_entries migration preserve sun data that already exists?
//
// The trackers flow starts from an empty database, so it exercises the
// fresh-install path only. Cedric has real sun_log rows on his phone. This
// simulates a pre-migration database — sun_log rows, no sun_entries — and runs
// the backfill against it.
import { openApp } from '../lib/session.mjs';
import { onboard } from '../lib/prelude.mjs';

const ctx = await openApp({ label: 'backfill', stubNotificationScheduler: true });
const { page } = ctx;
await onboard(ctx);

const sql = (q, p = []) => ctx.sql(q, p);
const call = (fn, ...args) => page.evaluate(async ({ fn, args }) => {
  const id = window.__PT_MODS['src/db/queries.ts'];
  const m = window.__r(id);
  return m[fn](...args);
}, { fn, args });

// Rewind to a pre-migration shape: sun_log rows with history, no sun_entries.
await sql('DROP TABLE IF EXISTS sun_entries');
await sql("DELETE FROM sun_log");
await sql("INSERT INTO sun_log (date, minutes, uv_index, notes) VALUES ('2026-09-10', 45, NULL, 'long walk')");
await sql("INSERT INTO sun_log (date, minutes, uv_index, notes) VALUES ('2026-09-11', 20, NULL, '')");
await sql("INSERT INTO sun_log (date, minutes, uv_index, notes) VALUES ('2026-09-12', 0,  NULL, 'rained all day')");
console.log('pre-migration sun_log:', JSON.stringify(await sql('SELECT date, minutes, notes FROM sun_log ORDER BY date')));

// Re-run the migration exactly as app start does.
const ran = await page.evaluate(async () => {
  const id = window.__PT_MODS['src/db/schema.ts'];
  const m = window.__r(id);
  const fn = m.initDb;
  if (typeof fn !== "function") return Object.keys(m).join(", ");

  await fn();
  return 'ok';
});
console.log('migration call:', ran);

const entries = await sql('SELECT date, minutes FROM sun_entries ORDER BY date');
const logs = await sql('SELECT date, minutes, notes FROM sun_log ORDER BY date');
console.log('sun_entries after :', JSON.stringify(entries));
console.log('sun_log after     :', JSON.stringify(logs));

const backfilled = entries.length === 2
  && entries.some((e) => e.date === '2026-09-10' && e.minutes === 45)
  && entries.some((e) => e.date === '2026-09-11' && e.minutes === 20);
console.log(backfilled
  ? 'PASS: both days with minutes became a session; the 0-minute day did not'
  : 'FAIL: backfill did not reproduce the existing days');

const notesKept = logs.find((l) => l.date === '2026-09-10')?.notes === 'long walk'
  && logs.find((l) => l.date === '2026-09-12')?.notes === 'rained all day';
console.log(notesKept ? 'PASS: notes survived, including on the 0-minute day' : 'FAIL: notes lost');

// Idempotence: running it twice must not double-count.
await page.evaluate(async () => {
  const m = window.__r(window.__PT_MODS['src/db/schema.ts']);
  const fn = m.initDb;

  await fn();
});
const again = await sql('SELECT COUNT(*) AS n FROM sun_entries');
console.log(Number(again[0].n) === 2
  ? 'PASS: re-running the migration did not duplicate entries'
  : `FAIL: entries went to ${again[0].n} after a second run`);

// And the history reader sees the backfilled days.
const hist = await call('getSunHistory', 30, '2026-09-13');
console.log('getSunHistory    :', JSON.stringify(hist));

await ctx.close();
