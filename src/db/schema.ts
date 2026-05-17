import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('coimbra.db');
  }
  return db;
}

export async function initDb(): Promise<void> {
  const database = await getDb();

  await database.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL DEFAULT 'Patient',
      weight_kg REAL NOT NULL DEFAULT 70,
      start_date TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
      bedtime_hour INTEGER NOT NULL DEFAULT 22,
      bedtime_minute INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS supplements (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      form TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'coimbra_standard',
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS schedule_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplement_id TEXT NOT NULL,
      anchor_type TEXT NOT NULL DEFAULT 't0',
      offset_minutes INTEGER NOT NULL DEFAULT 0,
      tolerance_window INTEGER NOT NULL DEFAULT 30,
      with_food INTEGER NOT NULL DEFAULT 0,
      dose_amount TEXT NOT NULL DEFAULT '',
      dose_unit TEXT NOT NULL DEFAULT '',
      display_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(supplement_id) REFERENCES supplements(id)
    );

    CREATE TABLE IF NOT EXISTS supplement_conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplement_id_a TEXT NOT NULL,
      supplement_id_b TEXT NOT NULL,
      min_separation_minutes INTEGER NOT NULL DEFAULT 60,
      notes TEXT NOT NULL DEFAULT '',
      FOREIGN KEY(supplement_id_a) REFERENCES supplements(id),
      FOREIGN KEY(supplement_id_b) REFERENCES supplements(id)
    );

    CREATE TABLE IF NOT EXISTS daily_anchors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      t0_timestamp INTEGER,
      water_ml INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS dose_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      supplement_id TEXT NOT NULL,
      rule_id INTEGER NOT NULL,
      scheduled_time INTEGER NOT NULL,
      logged_time INTEGER,
      status TEXT NOT NULL DEFAULT 'upcoming',
      FOREIGN KEY(supplement_id) REFERENCES supplements(id),
      FOREIGN KEY(rule_id) REFERENCES schedule_rules(id)
    );

    CREATE TABLE IF NOT EXISTS water_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      amount_ml INTEGER NOT NULL DEFAULT 250,
      logged_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_dose_logs_date ON dose_logs(date);
    CREATE INDEX IF NOT EXISTS idx_daily_anchors_date ON daily_anchors(date);
  `);
}
