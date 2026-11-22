import { expect, test } from '@playwright/test';

// Spec 2026-11-22-intro. Automated browsers never get the intro on their own; `?intro=1` forces it.

test('no intro for an automated browser on the plain home page', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.getByRole('button', { name: /ЗАПУСК/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-intro'))).toBe(
    false,
  );
});

test('?intro=1 shows the gate; skip reveals the page and remembers the visit', async ({ page }) => {
  await page.goto('/?intro=1');
  await expect(page.getByRole('dialog', { name: 'Интро Xstorex' })).toBeVisible();
  await expect(page.getByRole('button', { name: /ЗАПУСК/ })).toBeVisible();
  await page.getByRole('button', { name: /Пропустить/ }).click();
  await expect(page.getByRole('dialog', { name: 'Интро Xstorex' })).toHaveCount(0, {
    timeout: 6000,
  });
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-intro'))).toBe(
    false,
  );
  expect(await page.evaluate(() => localStorage.getItem('xstore.intro'))).toBe('seen');
  await expect(page.locator('h1')).toBeVisible();
});

test('launch plays the instruction and arrives at the site', async ({ page }) => {
  test.slow();
  await page.goto('/?intro=1');
  await page.getByRole('button', { name: /ЗАПУСК/ }).click();
  await expect(page.getByText('выбери удобный тариф')).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole('dialog', { name: 'Интро Xstorex' })).toHaveCount(0, {
    timeout: 30000,
  });
  await expect(page.locator('h1')).toBeVisible();
});
