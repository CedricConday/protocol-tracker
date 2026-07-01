import { getDb } from './schema';

// Pure-tracker build: the app ships with NO pre-loaded protocol, supplements,
// schedule, interaction warnings, dietary rules, or awareness content. The user
// enters their own protocol in the app (Supplement Editor). The original seed
// data is preserved in src/_sidelined/seed.original.ts.
export async function seedDb(): Promise<void> {
  const db = await getDb();
  // A single, user-configurable blood-test reminder interval. No content, just
  // an empty default the user can change.
  await db.runAsync(
    'INSERT OR IGNORE INTO blood_test_reminders (id, interval_days) VALUES (1, 90)'
  );
}

export async function createDefaultProfile(name: string, weight_kg: number): Promise<void> {
  const db = await getDb();
  const today = new Date().toISOString().split('T')[0];
  await db.runAsync(
    `INSERT OR REPLACE INTO user_profile (id, name, weight_kg, start_date, timezone, bedtime_hour, bedtime_minute)
     VALUES (1, ?, ?, ?, 'Europe/Berlin', 22, 0)`,
    [name, weight_kg, today]
  );
}
