import { expect, test } from '@playwright/test';

// Purchase, connection and install components live on /dev/ui until M2–M5 (plan task 9).

test('staged progress, stepper and border beam render on /dev/ui', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev/ui');
  const bar = page.getByRole('progressbar');
  await expect(bar).toHaveAttribute('aria-valuetext', 'Загрузка, 60%');
  const steps = page.getByRole('list', { name: 'Подключение iPhone' });
  await expect(steps.locator('[aria-current="step"]')).toHaveCount(1);
  await expect(page.locator('[data-border-beam]')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a toast appears as a dark pill', async ({ page }) => {
  await page.goto('/dev/ui');
  await page.getByRole('button', { name: 'Показать уведомление' }).click();
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Сохранено' });
  await expect(toast).toBeVisible();
  await expect(toast).toHaveCSS('background-color', 'rgb(14, 26, 51)');
  await expect(toast).toHaveCSS('border-radius', '999px');
});
