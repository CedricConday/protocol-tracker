import * as SQLite from 'expo-sqlite';

// Full implementation requires expo-sqlite encryption support — activate when bare workflow
export async function runEncryptionMigration(_db: SQLite.SQLiteDatabase): Promise<void> {
  console.log('encryption migration: skipped (native module not available)');
}
