import { expect, test } from '@playwright/test';

test('unknown path shows the Russian 404 inside the site header and footer', async ({ page }) => {
  const response = await page.goto('/takoy-stranicy-net');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Страница не найдена' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'На главную', exact: true })).toHaveAttribute(
    'href',
    '/',
  );
  await expect(page.locator('header')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Xstore, на главную' })).toBeVisible();
  await expect(page.locator('footer')).toBeVisible();
  await expect(page.locator('footer').getByRole('link', { name: 'Условия' })).toBeVisible();
});
