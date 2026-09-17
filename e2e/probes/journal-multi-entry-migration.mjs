// v17 must reach a device whose migration chain had already stalled.
//
// The multi-entry journal shipped on 2026-09-17 and did not appear on the one
// device that mattered. The code was right; the chain never got to it. v15
// added six columns to schedule_rules unguarded, and those columns also live in
// schema.ts's fresh-install block, so a device that had them already threw
// `duplicate column name: frequency`. runMigrations stops at the first failure
// by design — so the version stuck at 14, v17 never ran, the UNIQUE(date) on
// journal_entries survived, and a second entry for the same day threw a
// constraint error that the screen's write chain swallowed. Nothing was shown.
//
// This replays that world from three starting versions and asserts the chain
// now reaches the newest one, the UNIQUE is gone, and a second same-day entry
// saves. Run it against a dev server: PT_E2E_URL=http://localhost:8102 node
// e2e/probes/journal-multi-entry-migration.mjs
import { openApp } from '../lib/session.mjs';

const ctx = await openApp({ label: 'journal-multi-entry-migration', stubNotificationScheduler: true });

const out = await ctx.page.evaluate(async () => {
  const sch = window.__r(window.__PT_MODS['src/db/schema.ts']);
  const mig = window.__r(window.__PT_MODS['src/db/migrations.ts']);
  const db = await sch.getDb();
  const log = {};

  await db.execAsync('DROP TABLE IF EXISTS journal_entries');
  await db.execAsync(`CREATE TABLE journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    mood TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    dietary_note TEXT NOT NULL DEFAULT '',
    compliance_pct INTEGER NOT NULL DEFAULT 0,
    doses_taken INTEGER NOT NULL DEFAULT 0,
    doses_total INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  await db.runAsync("INSERT INTO journal_entries (date, mood, note) VALUES ('2026-09-17','🙂','morning')");

  for (const from of ['8', '14', '16']) {
    await db.runAsync("INSERT OR REPLACE INTO misc_flags (key, value) VALUES ('schema_version', ?)", [from]);
    await db.runAsync("DELETE FROM misc_flags WHERE key='last_migration_error'");
    await mig.runMigrations(db);
    const idx = await db.getAllAsync('PRAGMA index_list(journal_entries)');
    const row = {
      reached: (await db.getFirstAsync("SELECT value v FROM misc_flags WHERE key='schema_version'"))?.v,
      error: (await db.getFirstAsync("SELECT value v FROM misc_flags WHERE key='last_migration_error'"))?.v ?? null,
      uniqueLeft: idx.some((i) => i.unique === 1),
      // The morning entry must still be there: v17 rebuilds the table, and a
      // rebuild that loses rows is worse than the bug it fixes.
      kept: (await db.getFirstAsync("SELECT COUNT(*) c FROM journal_entries WHERE note='morning'"))?.c,
    };
    try {
      await db.runAsync("INSERT INTO journal_entries (date, mood, note) VALUES ('2026-09-17','😔','evening')");
      row.secondEntry = 'OK';
      await db.runAsync("DELETE FROM journal_entries WHERE note='evening'");
    } catch (e) {
      row.secondEntry = 'THREW: ' + String(e?.message ?? e).slice(0, 80);
    }
    log[`from_v${from}`] = row;
  }
  // ── and the case the repair pass exists for: a chain that still breaks ──
  // lab_results is gone, so v8's ALTER throws and the chain stops at v7 — far
  // short of v17. The journal must be repaired anyway.
  await db.execAsync('DROP TABLE IF EXISTS journal_entries');
  await db.execAsync(`CREATE TABLE journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    mood TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    dietary_note TEXT NOT NULL DEFAULT '',
    compliance_pct INTEGER NOT NULL DEFAULT 0,
    doses_taken INTEGER NOT NULL DEFAULT 0,
    doses_total INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  await db.runAsync("INSERT INTO journal_entries (date, mood, note) VALUES ('2026-09-17','🙂','morning')");
  await db.execAsync('DROP TABLE IF EXISTS lab_results');
  await db.runAsync("INSERT OR REPLACE INTO misc_flags (key, value) VALUES ('schema_version','7')");
  await db.runAsync("DELETE FROM misc_flags WHERE key='last_migration_error'");
  await mig.runMigrations(db);
  const brokenIdx = await db.getAllAsync('PRAGMA index_list(journal_entries)');
  const broken = {
    reached: (await db.getFirstAsync("SELECT value v FROM misc_flags WHERE key='schema_version'"))?.v,
    error: (await db.getFirstAsync("SELECT value v FROM misc_flags WHERE key='last_migration_error'"))?.v ?? null,
    uniqueLeft: brokenIdx.some((i) => i.unique === 1),
    kept: (await db.getFirstAsync("SELECT COUNT(*) c FROM journal_entries WHERE note='morning'"))?.c,
  };
  try {
    await db.runAsync("INSERT INTO journal_entries (date, mood, note) VALUES ('2026-09-17','😔','evening')");
    broken.secondEntry = 'OK';
  } catch (e) {
    broken.secondEntry = 'THREW: ' + String(e?.message ?? e).slice(0, 80);
  }
  log.chain_still_broken = broken;

  return log;
});

console.log(JSON.stringify(out, null, 2));
const bad = Object.entries(out).filter(([k, r]) =>
  // The induced-stall case is SUPPOSED to record a migration error — what it
  // must not do is leave the journal broken.
  r.uniqueLeft || r.secondEntry !== 'OK' || r.kept !== 1 ||
  (k !== 'chain_still_broken' && r.error !== null));
console.log(bad.length ? `FAIL: ${bad.map(([k]) => k).join(', ')}` : 'PASS: chain completes and a day holds several entries');
await ctx.browser?.close?.();
process.exit(bad.length ? 1 : 0);
