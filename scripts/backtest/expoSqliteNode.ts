/**
 * expo-sqlite shim over node:sqlite (Node >= 22).
 *
 * The back-test drives the app's REAL data layer (src/db/queries.ts,
 * src/engine/scheduler.ts). Those import `expo-sqlite`, which only exists on a
 * device. This module implements the slice of the expo-sqlite async API that
 * the app actually uses, backed by a synchronous in-process SQLite database,
 * and is aliased in over `expo-sqlite` by vitest.backtest.config.ts.
 *
 * It is a test harness, not app code. Nothing here ships.
 */
import { DatabaseSync } from 'node:sqlite';

type Param = string | number | bigint | null | Uint8Array;

// expo-sqlite accepts booleans and undefined in the param array; node:sqlite
// rejects both. Normalise so the app's own call sites work unchanged.
function normalise(params: unknown[]): Param[] {
  return params.map((p) => {
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p === undefined) return null;
    return p as Param;
  });
}

function flatten(params: unknown[]): unknown[] {
  // Call sites use both runAsync(sql, [a, b]) and runAsync(sql, a, b).
  if (params.length === 1 && Array.isArray(params[0])) return params[0] as unknown[];
  return params;
}

export class NodeSQLiteDatabase {
  private db: DatabaseSync;
  private depth = 0;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
  }

  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async runAsync(sql: string, ...params: unknown[]): Promise<{ lastInsertRowId: number; changes: number }> {
    const r = this.db.prepare(sql).run(...normalise(flatten(params)));
    return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
  }

  async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    const row = this.db.prepare(sql).get(...normalise(flatten(params)));
    return (row as T) ?? null;
  }

  async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.db.prepare(sql).all(...normalise(flatten(params))) as T[];
  }

  // Nested calls are common (scheduler -> queries -> withTransactionAsync);
  // SQLite has no nested BEGIN, so inner levels just join the outer one.
  async withTransactionAsync(cb: () => Promise<void>): Promise<void> {
    if (this.depth > 0) {
      this.depth++;
      try { await cb(); } finally { this.depth--; }
      return;
    }
    this.depth = 1;
    this.db.exec('BEGIN');
    try {
      await cb();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    } finally {
      this.depth = 0;
    }
  }

  closeSync(): void {
    this.db.close();
  }
}

let current: NodeSQLiteDatabase | null = null;

export async function openDatabaseAsync(name: string): Promise<NodeSQLiteDatabase> {
  if (!current) current = new NodeSQLiteDatabase(process.env.BACKTEST_DB ?? ':memory:');
  return current;
}

export function __resetDatabase(): void {
  current?.closeSync();
  current = null;
}

export default { openDatabaseAsync };
