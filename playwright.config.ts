import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'pnpm --filter @astra/api dev', url: 'http://127.0.0.1:3001/health', reuseExistingServer: false },
    { command: 'pnpm --filter @astra/web dev', url: 'http://127.0.0.1:5173', reuseExistingServer: false },
  ],
});
