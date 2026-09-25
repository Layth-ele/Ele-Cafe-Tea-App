/**
 * vitest.rules.config.ts — Firestore security-rules tests.
 *
 * Runs against the Firestore emulator; use `npm run test:rules`, which
 * starts the emulator (demo project, no real data) around vitest.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
