import { expect, test } from '@playwright/test';

// Spec 2026-11-23-home-first-screen §1: Unbounded 500 for headings, Onest for text.
test('hero is Unbounded 500, text is Onest', async ({ page, isMobile }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const hero = page.locator('[data-home-hero] h1');
  await expect(hero).toHaveCSS('font-family', /Unbounded/i);
  await expect(hero).toHaveCSS('font-weight', '500');
  const heroSize = Number.parseFloat(await hero.evaluate((el) => getComputedStyle(el).fontSize));
  // Sizes variant А (owner 2026-11-23): 28 px on a phone, up to 56 px on a computer.
  if (isMobile) expect(heroSize).toBe(28);
  else {
    expect(heroSize).toBeGreaterThanOrEqual(34);
    expect(heroSize).toBeLessThanOrEqual(56);
  }
  const heroTrack = await hero.evaluate((el) => {
    const s = getComputedStyle(el);
    return Number.parseFloat(s.letterSpacing) / Number.parseFloat(s.fontSize);
  });
  expect(heroTrack).toBeCloseTo(-0.03, 3);

  const body = page.locator('body');
  await expect(body).toHaveCSS('font-family', /Onest/i);
  await expect(body).toHaveCSS('font-size', '16px');
  expect(await body.evaluate((el) => getComputedStyle(el).letterSpacing)).toMatch(/^(0px|normal)$/);
});
