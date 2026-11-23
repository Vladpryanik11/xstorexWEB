import { expect, test } from '@playwright/test';

// Spec 2026-11-23-home-first-screen §1: the first-screen title is Inter Tight 600 at −0.5 %
// (owner 2026-11-23, «ближе к Apple»), text is Onest.
test('hero is Inter Tight 600, text is Onest', async ({ page, isMobile }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const hero = page.locator('[data-home-hero] h1');
  await expect(hero).toHaveCSS('font-family', /Inter Tight/i);
  await expect(hero).toHaveCSS('font-weight', '600');
  const heroSize = Number.parseFloat(await hero.evaluate((el) => getComputedStyle(el).fontSize));
  // Owner 2026-11-23: 34 px on a phone («заголовок должен быть больше»), up to 56 px on a computer.
  if (isMobile) expect(heroSize).toBe(34);
  else {
    expect(heroSize).toBeGreaterThanOrEqual(34);
    expect(heroSize).toBeLessThanOrEqual(56);
  }
  const heroTrack = await hero.evaluate((el) => {
    const s = getComputedStyle(el);
    return Number.parseFloat(s.letterSpacing) / Number.parseFloat(s.fontSize);
  });
  expect(heroTrack).toBeCloseTo(-0.005, 3);

  // «App Store» never breaks across lines (owner 2026-11-23).
  expect(await hero.textContent()).toContain('App\u00a0Store');

  const body = page.locator('body');
  await expect(body).toHaveCSS('font-family', /Onest/i);
  await expect(body).toHaveCSS('font-size', '16px');
  expect(await body.evaluate((el) => getComputedStyle(el).letterSpacing)).toMatch(/^(0px|normal)$/);
});
