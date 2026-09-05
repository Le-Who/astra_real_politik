import { expect, test } from '@playwright/test';

test('startup reports the real API connection and supports both interface languages', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Astra Realpolitik' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Сервер доступен');
  await page.screenshot({ path: testInfo.outputPath('startup-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('startup-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('status')).toContainText('Server connected');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('startup distinguishes a failed connection from a running server', async ({ page }) => {
  await page.route('**/api/health', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Нет соединения');
  await page.unroute('**/api/health');
  await page.getByRole('button', { name: 'Проверить соединение' }).click();
  await expect(page.getByRole('status')).toContainText('Сервер доступен');
});
