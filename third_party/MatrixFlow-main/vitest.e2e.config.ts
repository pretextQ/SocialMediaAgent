import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    exclude: ['tests/e2e/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    setupFiles: ['tests/e2e/setup.ts'],
    pool: 'forks',
    reporters: ['verbose'],
  },
  resolve: {
    alias: {
      '@electron': path.resolve(__dirname, 'electron'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
