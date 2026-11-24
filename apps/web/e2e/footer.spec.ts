import { expect, type Locator, test } from '@playwright/test';

const css = (loc: Locator, prop: string) =>
  loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test('footer surface and links', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');
  // Owner 2026-11-24 12:43: a plain white footer, in the type of the site (the brand in
  // Inter Tight like the titles, the rest in Onest with Apple greys).
  expect(await css(footer, 'background-color')).toBe('rgb(255, 255, 255)');
  expect(await css(footer, 'background-image')).toBe('none');
  const brand = footer.getByRole('link', { name: /Xstore/ }).first();
  expect(await css(brand, 'font-family')).toMatch(/Inter Tight/i);
  expect(await css(brand, 'font-weight')).toBe('600');
  const link = footer.getByRole('link', { name: 'Пользовательское соглашение' });
  expect(await css(link, 'font-family')).toMatch(/Onest/i);
  expect(await css(link, 'font-size')).toBe('15px');
  expect(await css(footer.getByText(/© 2026/), 'color')).toBe('rgb(110, 110, 115)');
  await expect(footer.getByRole('link', { name: 'Пользовательское соглашение' })).toHaveAttribute(
    'href',
    '/terms',
  );
});
