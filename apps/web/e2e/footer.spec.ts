import { expect, type Locator, test } from '@playwright/test';

const css = (loc: Locator, prop: string) =>
  loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test('footer surface and links', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');
  expect(await css(footer, 'background-color')).toBe('rgb(240, 243, 250)');
  await expect(footer.getByRole('link', { name: 'Условия' })).toHaveAttribute('href', '/terms');
});
