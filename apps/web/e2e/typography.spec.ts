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
  // Owner 2026-11-24 («равномерно», variant 4): 28–40 px on a phone, growing with the screen
  // height; up to 56 px on a computer.
  if (isMobile) {
    expect(heroSize).toBeGreaterThanOrEqual(28);
    expect(heroSize).toBeLessThanOrEqual(40);
  } else {
    expect(heroSize).toBeGreaterThanOrEqual(34);
    expect(heroSize).toBeLessThanOrEqual(56);
  }
  const heroTrack = await hero.evaluate((el) => {
    const s = getComputedStyle(el);
    return Number.parseFloat(s.letterSpacing) / Number.parseFloat(s.fontSize);
  });
  // Owner 2026-11-24 («как у Apple»): tighter, −1.5 %.
  expect(heroTrack).toBeCloseTo(-0.015, 3);

  // «App Store» never breaks across lines (owner 2026-11-23).
  expect(await hero.textContent()).toContain('App\u00a0Store');

  const body = page.locator('body');
  await expect(body).toHaveCSS('font-family', /Onest/i);
  await expect(body).toHaveCSS('font-size', '16px');
  expect(await body.evaluate((el) => getComputedStyle(el).letterSpacing)).toMatch(/^(0px|normal)$/);
});

// Owner 2026-11-23, variant В+: the first-screen search is an App Store glass pill with a thin
// rim, a bluish shadow and 17px text (iOS Safari zooms into fields under 16px).
test('first-screen search is the App Store glass pill', async ({ page, isMobile }) => {
  await page.goto('/');
  const form = page.locator('[data-home-hero] form[role=search]');
  const input = form.locator('input');
  await expect(input).toHaveCSS('font-size', '17px');
  await expect(form).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.78)');
  await expect(form).toHaveCSS('backdrop-filter', /blur\(20px\)/);
  await expect(form).toHaveCSS(
    'box-shadow',
    'rgba(11, 26, 74, 0.08) 0px 0px 0px 1px inset, rgba(20, 73, 224, 0.08) 0px 4px 16px 0px',
  );
  // Owner 2026-11-24 («сетка Apple»): 44 px on a phone, 48 px on a computer.
  expect((await form.boundingBox())?.height).toBe(isMobile ? 44 : 48);
  expect(await input.evaluate((el) => getComputedStyle(el, '::placeholder').color)).toBe(
    'rgb(110, 110, 115)',
  );
});

// Owner 2026-11-23: both «Подключить» buttons are the Apple-like pill В+ in Apple blue #0071E3.
test('«Подключить iPhone» is a flat Apple-blue pill', async ({ page }) => {
  await page.goto('/');
  const cta = page.locator('[data-hero-cta]');
  await expect(cta).toHaveCSS('background-color', 'rgb(0, 113, 227)');
  await expect(cta).toHaveCSS('background-image', 'none');
  await expect(cta).toHaveCSS('box-shadow', 'none');
  // Owner 2026-11-24 («сетка Apple»): a 48px pill with a 17px label, full width.
  await expect(cta).toHaveCSS('font-size', '17px');
  await expect(cta).toHaveCSS('font-weight', '600');
  await expect(cta.locator('svg')).toHaveCount(0);
  // The same button on a computer (owner 2026-11-23): as wide as the search field above it.
  const search = await page.locator('[data-home-hero] form[role=search]').boundingBox();
  const box = await cta.boundingBox();
  expect(box?.height).toBe(48);
  expect(box?.width).toBe(search?.width);
  expect(box?.x).toBe(search?.x);
});

// Owner 2026-11-24 (variant Б «Синяя, как небо»): the plan card carries the sky of the first
// screen, the button is white and carries the price (13:57), the card is narrow.
test('plan card is the blue sky card', async ({ page }) => {
  await page.goto('/');
  const card = page.getByRole('region', { name: 'Весь каталог' }).locator('> div');
  await card.scrollIntoViewIfNeeded();
  expect(await card.evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(
    /linear-gradient\(.*rgb\(0, 102, 224\).*rgb\(10, 132, 255\)/,
  );
  const box = await card.boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(288);
  const cta = card.getByRole('link');
  await expect(cta).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(cta).toHaveCSS('color', 'rgb(0, 113, 227)');
  // 13:57, variant Б: the price is on the button, «/ мес.» quieter.
  await expect(cta.getByText('/ мес.', { exact: true })).toHaveCSS(
    'color',
    'rgba(0, 113, 227, 0.6)',
  );
  await expect(cta).toHaveCSS('box-shadow', 'none');
});
