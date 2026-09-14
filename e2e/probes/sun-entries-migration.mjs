// v16 must repair an install that predates sun_entries.
//
// Reproduces the real device state — schema_version already past the point
// where schema.ts's fresh-install branch runs, and no sun_entries table — then
// runs the migration chain and checks that history survived and logging works.
import { openApp } from '../lib/session.mjs';

const ctx = await openApp({ label: 'sun-entries-migration', stubNotificationScheduler: true });
const evalPage = (fn, args) => ctx.page.evaluate(fn, args);

const out = await evalPage(async () => {
  const q = window.__r(window.__PT_MODS['src/db/queries.ts']);
  const sch = window.__r(window.__PT_MODS['src/db/schema.ts']);
  const mig = window.__r(window.__PT_MODS['src/db/migrations.ts']);
  const db = await sch.getDb();
  const log = {};

  // ── Rebuild the pre-v16 world: sun_log with real history, no sun_entries.
  await db.execAsync('DROP TABLE IF EXISTS sun_entries');
  await db.execAsync(`CREATE TABLE IF NOT EXISTS sun_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL UNIQUE,
    minutes INTEGER NOT NULL DEFAULT 0, uv_index TEXT,
    notes TEXT NOT NULL DEFAULT '', logged_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  await db.runAsync("DELETE FROM sun_log");
  await db.runAsync("INSERT INTO sun_log (date, minutes, notes) VALUES ('2026-09-01', 35, 'Park')");
  await db.runAsync("INSERT INTO sun_log (date, minutes, notes) VALUES ('2026-09-02', 20, '')");
  await db.runAsync("INSERT OR REPLACE INTO misc_flags (key, value) VALUES ('schema_version','14')");

  // Logging must be broken in exactly the way the device shows.
  try { await q.logSunExposure(10, '', undefined, '2026-09-03'); log.beforeLog = 'SUCCEEDED (unexpected)'; }
  catch (e) { log.beforeLog = 'threw: ' + String(e.message ?? e).slice(0, 60); }

  await mig.runMigrations(db);
  log.version = (await db.getFirstAsync("SELECT value FROM misc_flags WHERE key='schema_version'"))?.value;
  log.backfilled = await db.getAllAsync('SELECT date, minutes FROM sun_entries ORDER BY date');

  // And logging must work afterwards, maintaining the invariant.
  await q.logSunExposure(15, 'After', undefined, '2026-09-01');
  const day = await db.getFirstAsync("SELECT minutes FROM sun_log WHERE date='2026-09-01'");
  const sum = await db.getFirstAsync("SELECT SUM(minutes) s FROM sun_entries WHERE date='2026-09-01'");
  log.dayTotal = day?.minutes; log.entrySum = sum?.s;
  log.detailSun = (await q.getDayDetail('2026-09-01')).sunEntries.length;
  return log;
});

console.log(JSON.stringify(out, null, 2));
const ok = (l, c) => console.log(`${c ? 'PASS' : 'FAIL'}: ${l}`);
ok('logging was broken before the migration', /threw/.test(out.beforeLog));
ok('schema_version reached 16', out.version === '16');
ok('history backfilled (35 + 20 preserved)',
   out.backfilled.length === 2 && out.backfilled[0].minutes === 35 && out.backfilled[1].minutes === 20);
ok('logging works after the migration', out.dayTotal === 50);
ok('invariant holds: sun_log.minutes === SUM(sun_entries)', out.dayTotal === out.entrySum);
ok('day sheet sees both sessions', out.detailSun === 2);
await ctx.close();
