/**
 * vitest.config.ts — unit test runner config.
 *
 * Scope: pure-function tests for business logic. Excludes Playwright
 * e2e tests. Path aliases mirror tsconfig.json so test imports work
 * the same way as src imports.
 */
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'tests/visual/**',
      'tests/a11y/**',
      'tests/seo/**',
    ],
    environment: 'node',
    globals: false,
  },
});
