import type { SQLiteDatabase } from 'expo-sqlite';

export async function addPerformanceIndexes(db: SQLiteDatabase): Promise<void> {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_dose_logs_date ON dose_logs(date)',
    'CREATE INDEX IF NOT EXISTS idx_dose_logs_supplement_date ON dose_logs(supplement_id, date)',
    'CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date)',
    'CREATE INDEX IF NOT EXISTS idx_lab_results_date ON lab_results(date)',
    'CREATE INDEX IF NOT EXISTS idx_action_queue_synced ON action_queue(synced)',
  ];
  for (const sql of indexes) {
    try {
      await db.execAsync(sql);
    } catch {
      // index may already exist
    }
  }
}
