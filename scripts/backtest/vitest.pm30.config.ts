import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// ±30-day Records-screen back-test config. Same expo-sqlite -> node:sqlite
// alias as vitest.backtest.config.ts, pointed at backtestPm30.test.ts instead.
export default defineConfig({
  resolve: {
    alias: {
      'expo-sqlite': resolve(__dirname, 'expoSqliteNode.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['scripts/backtest/backtestPm30.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
