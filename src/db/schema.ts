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
      source TEXT NOT NULL DEFAULT 'coimbra_standard'
    );

    CREATE TABLE IF NOT EXISTS doctor_profile (
      id INTEGER PRIMARY KEY NOT NULL DEFAULT 1,
      name TEXT NOT NULL DEFAULT '',
      clinic TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      protocol_variant TEXT NOT NULL DEFAULT 'standard',
      notes TEXT NOT NULL DEFAULT ''
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

  // Migrations: Add columns to existing tables (try/catch for idempotency)
  try {
    await database.execAsync(`
      ALTER TABLE supplements ADD COLUMN quantity_on_hand INTEGER
    `);
  } catch (e) {
    console.log('[Database] migration: quantity_on_hand column already exists');
  }


  try {
    await database.execAsync(`
      ALTER TABLE dose_logs ADD COLUMN missed_alerted INTEGER NOT NULL DEFAULT 0
    `);
  } catch (e) {
    console.log('[Database] migration: missed_alerted column already exists');
  }

  try {
    await database.execAsync(`
      ALTER TABLE dose_logs ADD COLUMN skip_reason TEXT
    `);
  } catch (e) {
    console.log('[Database] migration: skip_reason column already exists');
  }

  try {
    await database.execAsync(`
      ALTER TABLE supplements ADD COLUMN stock_days INTEGER DEFAULT NULL
    `);
  } catch (e) {
    console.log('[Database] migration: stock_days column already exists');
  }

  try {
    await database.execAsync(`
      ALTER TABLE day_anchors ADD COLUMN first_meal_time TEXT DEFAULT NULL
    `);
  } catch (e) {
    console.log('[Database] migration: first_meal_time column already exists');
  }

  try {
    await database.execAsync(`
      ALTER TABLE exercise_logs ADD COLUMN intensity TEXT DEFAULT 'moderate'
    `);
  } catch (e) {
    console.log('[Database] migration: exercise_logs.intensity already exists');
  }

  try {
    await database.execAsync(`
      ALTER TABLE relapse_events ADD COLUMN pain_type TEXT
    `);
  } catch (e) {
    console.log('[Database] migration: relapse_events.pain_type already exists');
  }

  try {
    await database.execAsync(`
      ALTER TABLE relapse_events ADD COLUMN lasted_24h INTEGER
    `);
  } catch (e) {
    console.log('[Database] migration: relapse_events.lasted_24h already exists');
  }

  try {
    await database.execAsync(`
      ALTER TABLE relapse_events ADD COLUMN has_fever INTEGER
    `);
  } catch (e) {
    console.log('[Database] migration: relapse_events.has_fever already exists');
  }

  // Migrate relapse_events CHECK constraint to include 'pain' type
  try {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS relapse_events_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('relapse','cortisone','symptom','pain')),
        cortisone_dose_mg INTEGER,
        notes TEXT NOT NULL DEFAULT '',
        severity INTEGER CHECK(severity BETWEEN 1 AND 5),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        pain_type TEXT,
        lasted_24h INTEGER,
        has_fever INTEGER
      );
      INSERT OR IGNORE INTO relapse_events_v2
        SELECT id, date, type, cortisone_dose_mg, notes, severity, created_at,
               pain_type, lasted_24h, has_fever
        FROM relapse_events
        WHERE type IN ('relapse','cortisone','symptom','pain');
      DROP TABLE relapse_events;
      ALTER TABLE relapse_events_v2 RENAME TO relapse_events;
    `);
  } catch (e) {
    console.log('[Database] migration: relapse_events constraint already updated');
  }

  // Seed contraindication rules (idempotent — only if table is empty)
  const existingRules = await database.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM contraindication_rules'
  );
  if (!existingRules || existingRules.c === 0) {
    await database.execAsync(`
      INSERT INTO contraindication_rules (drug_name, drug_aliases, severity, message, safe_alternative) VALUES
      ('Lithium Carbonate', 'lithium carbonate,lithiumcarbonat', 'danger',
       'Lithium Carbonate is contraindicated with high-dose D3. It causes dangerous calcium dysregulation. Discuss with your doctor immediately.',
       'Lithium Orotate is prescribed by some Coimbra doctors and is considered safe — confirm the exact form with your prescriber.'),
      ('Thiazide Diuretics', 'hydrochlorothiazide,HCTZ,chlorthalidone,indapamide,bendroflumethiazide', 'danger',
       'Thiazide diuretics increase kidney calcium reabsorption. Combined with high-dose D3 this significantly raises hypercalcemia risk.',
       'Discuss alternative diuretics with your doctor. Loop diuretics (furosemide) have a different calcium profile.'),
      ('Calcium Supplements', 'calcium carbonate,calcium citrate,calciumcarbonat,kalzium', 'danger',
       'Supplemental calcium is incompatible with the Coimbra Protocol. The protocol relies on strict dietary calcium restriction — supplementation defeats this.',
       'Get calcium from diet only. Your target is <400mg dietary calcium per day on the standard protocol.'),
      ('Cortisone', 'prednisone,prednisolone,methylprednisolone,dexamethasone,hydrocortisone,kortison', 'warning',
       'Corticosteroids reduce Vitamin D efficacy and transiently alter calcium handling. Log any cortisone pulse in Events. Do not stop either medication without doctor approval.',
       'Continue both. Flag the combination to your neurologist for monitoring.'),
      ('Hormonal Contraceptives', 'birth control pill,pille,estrogen,ethinylestradiol,levonorgestrel', 'warning',
       'Some hormonal contraceptives affect Vitamin D metabolism and serum calcium levels. Monitor your blood results more frequently.',
       'Discuss with your gynecologist. Non-hormonal contraception avoids this interaction.'),
      ('Ibuprofen', 'ibuprofen,nurofen,advil,ibu,ibuprofeno', 'warning',
       'NSAIDs including ibuprofen impair kidney function. The Coimbra Protocol depends on healthy kidney calcium excretion. Occasional use is lower risk; chronic use is a concern.',
       'Paracetamol/acetaminophen for pain relief has no interaction with the protocol.'),
      ('Naproxen', 'naproxen,aleve,naproxeno', 'warning',
       'NSAIDs including naproxen impair kidney function needed for safe calcium excretion on high-dose D3.',
       'Paracetamol/acetaminophen for pain relief has no interaction with the protocol.'),
      ('Cholestyramine', 'cholestyramine,colestyramin,questran', 'warning',
       'Cholestyramine binds fat-soluble vitamins in the gut including Vitamin D3, significantly reducing absorption.',
       'If cholestyramine is required, take Vitamin D3 at least 4 hours before or after the dose.');
    `);
  }
}
