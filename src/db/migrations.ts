import * as SQLite from 'expo-sqlite';

type Migration = { version: number; up: (db: SQLite.SQLiteDatabase) => Promise<void> };

const migrations: Migration[] = [
  {
    version: 1,
    up: async (db) => {
      await db.execAsync(`
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
          category TEXT NOT NULL DEFAULT 'protocol_standard',
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
          missed_alerted INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY(supplement_id) REFERENCES supplements(id),
          FOREIGN KEY(rule_id) REFERENCES schedule_rules(id)
        );

        CREATE TABLE IF NOT EXISTS water_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          amount_ml INTEGER NOT NULL DEFAULT 250,
          logged_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS exercise_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          duration_minutes INTEGER NOT NULL DEFAULT 30,
          type TEXT NOT NULL DEFAULT 'walk',
          logged_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS dietary_restrictions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ingredient TEXT NOT NULL,
          aliases TEXT NOT NULL DEFAULT '',
          severity TEXT NOT NULL DEFAULT 'forbidden',
          notes TEXT NOT NULL DEFAULT '',
          source TEXT NOT NULL DEFAULT 'protocol_standard'
        );

        CREATE TABLE IF NOT EXISTS awareness_dates (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          month INTEGER NOT NULL,
          day INTEGER NOT NULL,
          message TEXT NOT NULL,
          notified INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS journal_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL UNIQUE,
          mood TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          compliance_pct INTEGER NOT NULL DEFAULT 0,
          doses_taken INTEGER NOT NULL DEFAULT 0,
          doses_total INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS relapse_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('relapse','cortisone','symptom','pain')),
          cortisone_dose_mg INTEGER,
          notes TEXT NOT NULL DEFAULT '',
          severity INTEGER CHECK(severity BETWEEN 1 AND 5),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS mri_scans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          facility TEXT NOT NULL DEFAULT '',
          scan_type TEXT NOT NULL DEFAULT 'brain',
          contrast INTEGER NOT NULL DEFAULT 0,
          new_lesions TEXT NOT NULL DEFAULT '',
          enhancing_lesions INTEGER,
          overall_assessment TEXT NOT NULL DEFAULT 'stable',
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS lab_results (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          vit_d_ngml REAL,
          pth_pgml REAL,
          calcium_serum_mgdl REAL,
          calcium_urine_mg_g_cr REAL,
          creatinine_mgdl REAL,
          sulkowitch TEXT,
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS contraindication_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          drug_name TEXT NOT NULL,
          drug_aliases TEXT NOT NULL DEFAULT '',
          severity TEXT NOT NULL DEFAULT 'warning',
          message TEXT NOT NULL,
          safe_alternative TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS patient_medications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          form TEXT NOT NULL DEFAULT '',
          dose_mg REAL,
          frequency TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sun_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL UNIQUE,
          minutes INTEGER NOT NULL DEFAULT 0,
          uv_index TEXT,
          notes TEXT NOT NULL DEFAULT '',
          logged_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS blood_test_reminders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          last_test_date TEXT,
          next_reminder_date TEXT,
          interval_days INTEGER NOT NULL DEFAULT 90
        );

        CREATE TABLE IF NOT EXISTS meal_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          meal_type TEXT NOT NULL,
          time TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '',
          logged_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS care_surveys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          scores_json TEXT NOT NULL,
          total INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS news_cache (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          summary TEXT NOT NULL,
          url TEXT NOT NULL UNIQUE,
          published_date TEXT NOT NULL,
          fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS feedback (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          message TEXT NOT NULL,
          email TEXT NOT NULL DEFAULT '',
          sent INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS medical_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          scheduled_date TEXT NOT NULL,
          scheduled_time TEXT,
          location TEXT,
          notes TEXT,
          reminder_7d INTEGER DEFAULT 1,
          reminder_3d INTEGER DEFAULT 1,
          reminder_1d INTEGER DEFAULT 1,
          reminder_2h INTEGER DEFAULT 1,
          completed INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_dose_logs_date ON dose_logs(date);
        CREATE INDEX IF NOT EXISTS idx_daily_anchors_date ON daily_anchors(date);
        CREATE INDEX IF NOT EXISTS idx_exercise_logs_date ON exercise_logs(date);
        CREATE INDEX IF NOT EXISTS idx_medical_events_date ON medical_events(scheduled_date);
      `);
    },
  },
  {
    version: 2,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS action_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action_type TEXT NOT NULL,
          payload TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          synced INTEGER NOT NULL DEFAULT 0
        );
      `);
    },
  },
  {
    version: 3,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS family_members (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          joined_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    },
  },
  {
    version: 4,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS sleep_checkins (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          score INTEGER NOT NULL,
          answers TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 5,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS calcium_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          test_start_date TEXT NOT NULL,
          day INTEGER NOT NULL,
          calcium_mg INTEGER NOT NULL,
          notes TEXT NOT NULL DEFAULT ''
        );
      `);
    },
  },
  {
    version: 6,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS misc_flags (
          key TEXT PRIMARY KEY,
          value TEXT
        );
      `);
    },
  },
  {
    version: 7,
    up: async (db) => {
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_lab_results_date ON lab_results(date);
        CREATE INDEX IF NOT EXISTS idx_action_queue_synced ON action_queue(synced);
      `);
    },
  },
  {
    version: 8,
    up: async (db) => {
      // Idempotent: only ALTER if the column is absent — re-running after a
      // partial migration would otherwise throw "duplicate column" and stall
      // the entire chain.
      const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(lab_results)`);
      if (!cols.some((c) => c.name === 'nfl_pgl')) {
        await db.execAsync(`ALTER TABLE lab_results ADD COLUMN nfl_pgl REAL;`);
      }
    },
  },
  {
    version: 9,
    up: async (db) => {
      // dietary_note historically lived ONLY inside initDb's version-0 block,
      // so any device already past version 0 never received the column — every
      // journal save (which INSERTs dietary_note) then threw and silently
      // failed. Add it here for all installs. Idempotent: skip if present so a
      // device that DID get it via initDb doesn't error and stall the chain.
      const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(journal_entries)`);
      if (!cols.some((c) => c.name === 'dietary_note')) {
        await db.execAsync(`ALTER TABLE journal_entries ADD COLUMN dietary_note TEXT NOT NULL DEFAULT ''`);
      }
    },
  },
  {
    version: 10,
    up: async (db) => {
      // schema.ts's try/catch ALTER for first_meal_time targeted the wrong
      // table name ("day_anchors" instead of "daily_anchors") and therefore
      // silently no-oped on every existing device. Add the column here so
      // upgraded installs are guaranteed to have it.
      const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(daily_anchors)`);
      if (!cols.some((c) => c.name === 'first_meal_time')) {
        await db.execAsync(`ALTER TABLE daily_anchors ADD COLUMN first_meal_time TEXT DEFAULT NULL`);
      }
    },
  },
  {
    version: 11,
    up: async (db) => {
      // schema.ts's boot-time try/catch ALTERs are not guaranteed to run after
      // the migration chain on upgraded devices (the version-0 path is skipped).
      // Re-add every column that schema.ts adds via try/catch but that is NOT
      // already covered by an earlier migration (v8 covers nfl_pgl; v9 covers
      // dietary_note; v10 covers first_meal_time — all others land here).
      const suppCols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(supplements)`);
      if (!suppCols.some((c) => c.name === 'quantity_on_hand')) {
        await db.execAsync(`ALTER TABLE supplements ADD COLUMN quantity_on_hand INTEGER`);
      }
      if (!suppCols.some((c) => c.name === 'stock_days')) {
        await db.execAsync(`ALTER TABLE supplements ADD COLUMN stock_days INTEGER DEFAULT NULL`);
      }

      const doseLogCols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(dose_logs)`);
      if (!doseLogCols.some((c) => c.name === 'skip_reason')) {
        await db.execAsync(`ALTER TABLE dose_logs ADD COLUMN skip_reason TEXT`);
      }

      const exerciseCols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(exercise_logs)`);
      if (!exerciseCols.some((c) => c.name === 'intensity')) {
        await db.execAsync(`ALTER TABLE exercise_logs ADD COLUMN intensity TEXT DEFAULT 'moderate'`);
      }

      const relapseCols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(relapse_events)`);
      if (!relapseCols.some((c) => c.name === 'pain_type')) {
        await db.execAsync(`ALTER TABLE relapse_events ADD COLUMN pain_type TEXT`);
      }
      if (!relapseCols.some((c) => c.name === 'lasted_24h')) {
        await db.execAsync(`ALTER TABLE relapse_events ADD COLUMN lasted_24h INTEGER`);
      }
      if (!relapseCols.some((c) => c.name === 'has_fever')) {
        await db.execAsync(`ALTER TABLE relapse_events ADD COLUMN has_fever INTEGER`);
      }
    },
  },
  {
    version: 12,
    up: async (db) => {
      // Clears any previously-seeded protocol so the app starts from an empty
      // protocol the user builds themselves (seedDb no longer seeds content).
      await db.execAsync(`
        DELETE FROM dose_logs;
        DELETE FROM schedule_rules;
        DELETE FROM supplement_conflicts;
        DELETE FROM supplements;
      `);
    },
  },
  {
    version: 13,
    up: async (db) => {
      await db.execAsync(`
        UPDATE supplements SET category = 'protocol_standard' WHERE category = 'coimbra_standard';
        UPDATE dietary_restrictions SET source = 'protocol_standard' WHERE source = 'coimbra_standard';
      `);
    },
  },
];

async function getSchemaVersion(db: SQLite.SQLiteDatabase): Promise<number> {
  try {
    // misc_flags may not exist yet on a truly fresh DB — guard with try/catch
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM misc_flags WHERE key = 'schema_version'"
    );
    const v = parseInt(row?.value ?? '0', 10);
    return isNaN(v) ? 0 : v;
  } catch {
    return 0;
  }
}

async function setSchemaVersion(db: SQLite.SQLiteDatabase, version: number): Promise<void> {
  await db.runAsync(
    "INSERT OR REPLACE INTO misc_flags (key, value) VALUES (?, ?)",
    ['schema_version', String(version)]
  );
}

async function logMigrationError(db: SQLite.SQLiteDatabase, message: string): Promise<void> {
  try {
    await db.runAsync(
      "INSERT OR REPLACE INTO misc_flags (key, value) VALUES (?, ?)",
      ['last_migration_error', message]
    );
  } catch (e) {
    // misc_flags may not exist yet — just log to console
    console.error('[Migrations] could not write error to misc_flags:', e);
  }
}

export async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  // Bootstrap misc_flags before any migration runs — setSchemaVersion writes
  // to it after each migration, so on a fresh DB v1 would otherwise fail to
  // record its success (the table is otherwise only created in v6).
  await db.execAsync(`CREATE TABLE IF NOT EXISTS misc_flags (key TEXT PRIMARY KEY, value TEXT);`);

  const currentVersion = await getSchemaVersion(db);
  const pending = migrations
    .filter((m) => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    try {
      console.log(`[Migrations] running version ${migration.version}`);
      await migration.up(db);
      // Write the version after each successful migration so a partial run
      // resumes from the correct point on next boot.
      await setSchemaVersion(db, migration.version);
      console.log(`[Migrations] version ${migration.version} complete`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[Migrations] version ${migration.version} failed: ${msg}`);
      await logMigrationError(db, `v${migration.version}: ${msg}`);
      // Do not crash — stop the chain here so later migrations don't run
      // against a potentially inconsistent schema.
      return;
    }
  }
}
