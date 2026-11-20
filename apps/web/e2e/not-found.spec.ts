import { expect, test } from '@playwright/test';

test('unknown path shows the Russian 404 inside the site header and footer', async ({ page }) => {
  const response = await page.goto('/takoy-stranicy-net');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Такой страницы нет' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'В каталог', exact: true })).toHaveAttribute(
    'href',
    '/',
  );
  await expect(page.locator('header')).toBeVisible();
  // From 48em «Тарифы» is in the pill; on a phone it lives in the menu (owner 2026-11-20).
  const wide = (page.viewportSize()?.width ?? 0) >= 768;
  const header = page.locator('header');
  if (wide) await expect(header.getByRole('link', { name: 'Тарифы' })).toBeVisible();
  else await expect(header.getByRole('button', { name: 'Меню' })).toBeVisible();
  await expect(page.locator('footer')).toBeVisible();
  await expect(
    page.locator('footer').getByRole('link', { name: 'Условия использования' }),
  ).toBeVisible();
});
