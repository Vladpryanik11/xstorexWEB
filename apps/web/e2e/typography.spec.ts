import { expect, test } from '@playwright/test';

// Spec 2026-11-17-typography: Manrope for headings, Inter for text, «много воздуха» tracking.
test('hero is Manrope, text is Inter, letters get air', async ({ page, isMobile }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const hero = page.locator('[data-home-hero] h1');
  await expect(hero).toHaveCSS('font-family', /Manrope/i);
  await expect(hero).toHaveCSS('font-weight', '700');
  const heroSize = Number.parseFloat(await hero.evaluate((el) => getComputedStyle(el).fontSize));
  // On a phone the hero uses the h1 step (owner 2026-11-20: «чуть меньше текст»).
  if (isMobile) expect(heroSize).toBe(28);
  else {
    expect(heroSize).toBeGreaterThanOrEqual(34);
    expect(heroSize).toBeLessThanOrEqual(48);
  }
  const heroTrack = await hero.evaluate((el) => {
    const s = getComputedStyle(el);
    return Number.parseFloat(s.letterSpacing) / Number.parseFloat(s.fontSize);
  });
  expect(heroTrack).toBeCloseTo(0.01, 3);

  const body = page.locator('body');
  await expect(body).toHaveCSS('font-family', /Inter/i);
  await expect(body).toHaveCSS('font-size', '16px');
  await expect(body).toHaveCSS('letter-spacing', '0.32px');
});
