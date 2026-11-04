import { expect, type Locator, test } from '@playwright/test';

const css = (loc: Locator, prop: string) =>
  loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test('header matches the reference values (desktop)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dev/ui?auth=1&path=/devices');
  const header = page.locator('header').first();
  expect((await header.boundingBox())?.height).toBe(60);
  expect(await css(header, 'background-image')).toContain('linear-gradient(rgb(12, 69, 183) 0%');
  const active = page.getByRole('link', { name: 'Ваши устройства' });
  expect(await css(active, 'background-color')).toBe('rgba(255, 255, 255, 0.2)');
  expect(await css(active, 'font-size')).toBe('14px');
  expect(await css(active, 'font-weight')).toBe('500');
  expect(await css(page.getByRole('link', { name: 'Профиль' }), 'color')).toBe(
    'rgb(230, 237, 251)',
  );
  expect(await css(page.getByRole('link', { name: 'Выйти' }), 'color')).toBe(
    'rgba(230, 237, 251, 0.72)',
  );
});

test('6px tint strip sits fixed at the very top', async ({ page }) => {
  await page.goto('/');
  const tint = page.locator('header > div[aria-hidden="true"]');
  await expect(tint).toHaveCount(1);
  expect(await css(tint, 'position')).toBe('fixed');
  expect(await css(tint, 'height')).toBe('6px');
  expect(await css(tint, 'background-color')).toBe('rgb(12, 69, 183)');
  const box = await tint.boundingBox();
  expect(box?.y).toBe(0);
  expect(box?.height).toBe(6);
});

test('auth header fits at 768px', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/dev/ui?auth=1&path=/devices');
  expect((await page.locator('header').first().boundingBox())?.height).toBe(60);
  await expect(page.getByRole('link', { name: 'Ваши устройства' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('no horizontal overflow at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/dev/ui');
  await expect(page.getByRole('button', { name: 'Меню' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('side sheet closes on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev/ui?auth=1');
  const burger = page.getByRole('button', { name: 'Меню' });
  await burger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Профиль' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(burger).toBeFocused();
});

test('focus ring stays visible on the open side sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev/ui');
  const burger = page.getByRole('button', { name: 'Меню' });
  await burger.click();
  const links = page.getByRole('dialog').getByRole('link');
  await expect(links.first()).toBeFocused();
  // Tab from the last sheet link wraps to the burger, which now sits white on the light sheet.
  await links.last().focus();
  await page.keyboard.press('Tab');
  await expect(burger).toBeFocused();
  expect(await burger.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
  // toHaveCSS retries, so the .22s background transition can settle first.
  await expect(burger).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(burger).toHaveCSS('outline-style', 'solid');
  await expect(burger).toHaveCSS('outline-color', 'rgb(34, 118, 243)');
});
