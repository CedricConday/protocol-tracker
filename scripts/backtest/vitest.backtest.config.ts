import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Back-test harness config. Aliases expo-sqlite to a node:sqlite driver so the
// app's real data layer runs in-process. Kept separate from vitest.config.ts so
// `npm test` stays a fast unit run.
export default defineConfig({
  resolve: {
    alias: {
      'expo-sqlite': resolve(__dirname, 'expoSqliteNode.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['scripts/backtest/backtest.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
