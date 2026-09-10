import { defineConfig } from 'vitest/config';

// Node-only unit tests for the data layer. Anything native (expo-sqlite via
// src/db/schema) is mocked in the test files, so no RN transform is needed.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
