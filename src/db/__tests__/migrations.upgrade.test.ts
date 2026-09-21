import { describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';

// `schema.ts` imports expo-sqlite for its types and for `getDb`, whose entry
// point is React Native's Flow source. Nothing here calls `getDb` — every test
// supplies its own database — so the module only has to exist.
vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(() => {
    throw new Error('the upgrade test supplies its own database');
  }),
}));

import { migrations, runMigrations } from '../migrations';
import { initDbOn } from '../schema';

/**
 * The upgrade path, run against a real database (2026-09-20).
 *
 * The first real install will not be a fresh install — it gets whatever prerelease
 * build is on it, upgraded in place. Nothing had ever run the migration chain
 * from an old recorded version to the newest one, so "your data survives the
 * update" was an assumption. This runs the real boot path (`runMigrations` then
 * `initDbOn`, the order App.tsx uses) against real SQLite at every version the
 * chain has ever recorded, and checks the install converges on the same schema
 * a fresh one gets, with its rows intact.
 *
 * The database is `node:sqlite`, not `expo-sqlite`: same engine, no native
 * build, and `adapt()` below is the whole difference — the migrations and the
 * schema pass under test are the app's own, imported, not copies.
 *
 * What this cannot do: recreate the *era's* fresh-install schema, because only
 * today's exists in the source. An install that stopped at v is therefore
 * approximated as today's base tables plus the chain up to v. That is honest
 * about replay safety, convergence and data survival — the three things that
 * break an upgrade — and silent about tables an old build created and no
 * migration since has touched.
 */

type Row = Record<string, unknown>;

/**
 * expo-sqlite's async surface over a synchronous node:sqlite handle.
 *
 * expo-sqlite takes bind values either spread or as one array — `runAsync(sql,
 * ['a', 'b'])` and `runAsync(sql, 'a', 'b')` are the same call, and the app uses
 * both forms. `flatten` is why: node:sqlite only takes them spread, and an array
 * arriving as a single bind value fails at the driver, inside the migration
 * runner's catch, which would read as a broken migration rather than a broken
 * adapter.
 */
function flatten(params: unknown[]): unknown[] {
  return params.length === 1 && Array.isArray(params[0]) ? (params[0] as unknown[]) : params;
}

function adapt(db: DatabaseSync) {
  return {
    execAsync: async (sql: string) => {
      db.exec(sql);
    },
    runAsync: async (sql: string, ...params: unknown[]) => {
      db.prepare(sql).run(...(flatten(params) as never[]));
    },
    getAllAsync: async <T>(sql: string, ...params: unknown[]) =>
      db.prepare(sql).all(...(flatten(params) as never[])) as T[],
    getFirstAsync: async <T>(sql: string, ...params: unknown[]) =>
      (db.prepare(sql).get(...(flatten(params) as never[])) ?? null) as T | null,
    withTransactionAsync: async (fn: () => Promise<void>) => {
      db.exec('BEGIN');
      try {
        await fn();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  } as never; // structural stand-in for SQLiteDatabase; only these five are called
}

const LATEST = Math.max(...migrations.map((m) => m.version));

/** Table and column names, which is what an upgrade can get wrong. */
function shapeOf(db: DatabaseSync): Record<string, string[]> {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%' ORDER BY name`
    )
    .all() as Row[];
  const shape: Record<string, string[]> = {};
  for (const t of tables) {
    const name = String(t.name);
    const cols = db.prepare(`PRAGMA table_info(${name})`).all() as Row[];
    shape[name] = cols.map((c) => String(c.name)).sort();
  }
  return shape;
}

function recordedVersion(db: DatabaseSync): number {
  const row = db
    .prepare(`SELECT value FROM misc_flags WHERE key = 'schema_version'`)
    .get() as Row | undefined;
  return parseInt(String(row?.value ?? '0'), 10);
}

/** A database as a build that stopped at `version` would have left it. */
async function installAt(version: number): Promise<DatabaseSync> {
  const db = new DatabaseSync(':memory:');
  const handle = adapt(db);
  await initDbOn(handle);
  for (const m of migrations.filter((x) => x.version <= version)) {
    await m.up(handle);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS misc_flags (key TEXT PRIMARY KEY, value TEXT)`);
  db.prepare(`INSERT OR REPLACE INTO misc_flags (key, value) VALUES ('schema_version', ?)`).run(
    String(version)
  );
  return db;
}

async function freshInstall(): Promise<DatabaseSync> {
  const db = new DatabaseSync(':memory:');
  const handle = adapt(db);
  await runMigrations(handle);
  await initDbOn(handle);
  return db;
}

describe('upgrading a prerelease install', () => {
  it('a fresh install lands on the newest version', async () => {
    const db = await freshInstall();
    expect(recordedVersion(db)).toBe(LATEST);
    db.close();
  });

  for (let v = 0; v <= LATEST; v++) {
    it(`an install recorded at v${v} upgrades to v${LATEST} with the same schema`, async () => {
      const db = await installAt(v);
      const handle = adapt(db);

      await runMigrations(handle);
      await initDbOn(handle);

      expect(recordedVersion(db)).toBe(LATEST);

      const fresh = await freshInstall();
      expect(shapeOf(db)).toEqual(shapeOf(fresh));
      fresh.close();

      // A stalled chain records why; a clean upgrade leaves nothing behind.
      const err = db
        .prepare(`SELECT value FROM misc_flags WHERE key = 'last_migration_error'`)
        .get();
      expect(err).toBeUndefined();

      db.close();
    });
  }

  it('the rows an upgrader already typed survive the upgrade', async () => {
    const db = await installAt(15);
    db.prepare(
      `INSERT INTO supplements (id, name) VALUES ('d3', 'Vitamin D3')`
    ).run();
    db.prepare(
      `INSERT INTO journal_entries (date, mood, note) VALUES ('2026-09-01', 'good', 'before the upgrade')`
    ).run();
    db.prepare(`INSERT INTO water_logs (date, amount_ml, logged_at) VALUES ('2026-09-01', 500, 1)`).run();

    await runMigrations(adapt(db));
    await initDbOn(adapt(db));

    const supp = db.prepare(`SELECT name FROM supplements`).all() as Row[];
    const journal = db.prepare(`SELECT note FROM journal_entries`).all() as Row[];
    const water = db.prepare(`SELECT amount_ml FROM water_logs`).all() as Row[];
    expect(supp.map((r) => r.name)).toEqual(['Vitamin D3']);
    expect(journal.map((r) => r.note)).toEqual(['before the upgrade']);
    expect(water.map((r) => r.amount_ml)).toEqual([500]);
    db.close();
  });

  it('running the chain twice changes nothing', async () => {
    const db = await freshInstall();
    const before = shapeOf(db);
    await runMigrations(adapt(db));
    await initDbOn(adapt(db));
    expect(shapeOf(db)).toEqual(before);
    expect(recordedVersion(db)).toBe(LATEST);
    db.close();
  });

  it('contraindication_rules is gone after the upgrade, and stays gone', async () => {
    const db = await installAt(19);
    expect(Object.keys(shapeOf(db))).toContain('contraindication_rules');

    await runMigrations(adapt(db));
    await initDbOn(adapt(db));

    expect(Object.keys(shapeOf(db))).not.toContain('contraindication_rules');
    db.close();
  });
});
