import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/tasks/**/*.test.ts', 'packages/**/*.test.ts'],
    environment: 'node',
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 10_000,
    hookTimeout: 20_000,
  },
});
