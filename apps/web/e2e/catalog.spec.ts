import { expect, test } from '@playwright/test';

// Data comes from `pnpm --filter @xstore/db seed:e2e` (global setup).

test('home shows collections and opens an app page', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Приложения для iPhone без компьютера' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Самый загружаемый' })).toBeVisible();
  await page
    .getByRole('link', { name: /^Тестовое приложение 1(?!\d)/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/app\/testovoe-prilozhenie-1$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Тестовое приложение 1' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Войти' }).last()).toHaveAttribute(
    'href',
    /\/signin\?next=/,
  );
});

test('home renders every collection layout and the category chips', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('list', { name: 'Баннеры' })).toBeVisible();
  for (const title of ['Самый загружаемый', 'Тенденции', 'Удалённые из App Store']) {
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  }
  const chips = page.getByRole('navigation', { name: 'Категории' });
  await expect(chips.getByRole('link', { name: 'Игры' })).toHaveAttribute('href', '/category/igry');
  // The seeded icons come from object storage.
  const icon = page.locator('img[src*="/icons/"]').first();
  await expect(icon).toBeVisible();
  expect(await icon.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

test('search finds by Cyrillic prefix', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: 'Поиск' }).first();
  await search.fill('тест');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/search\?q=/);
  await expect(page.getByRole('link', { name: /^Тестовое приложение 1(?!\d)/ })).toBeVisible();
  await expect(page.getByText('Скрытое тестовое приложение')).toHaveCount(0);
});

test('search explains short and empty queries', async ({ page }) => {
  await page.goto('/search?q=т');
  await expect(page.getByText('Введите хотя бы 2 символа')).toBeVisible();
  await page.goto('/search?q=несуществующее');
  await expect(page.getByText('Ничего не нашлось. Попробуйте другое название.')).toBeVisible();
});

test('hidden app is 404', async ({ page }) => {
  const res = await page.goto('/app/hidden-app');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible();
});

test('app page has SoftwareApplication JSON-LD', async ({ page }) => {
  await page.goto('/app/testovoe-prilozhenie-1');
  const raw = await page.locator('script[type="application/ld+json"]').textContent();
  const data = JSON.parse(raw ?? '{}');
  expect(data).toMatchObject({
    '@type': 'SoftwareApplication',
    name: 'Тестовое приложение 1',
    operatingSystem: 'iOS',
    applicationCategory: 'Игры',
    softwareVersion: '1.1',
    aggregateRating: { ratingValue: 4.5, ratingCount: 120 },
  });
  await expect(page.getByText('Русский +1')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'История версий' })).toBeVisible();
  await expect(page.getByText('Удалено из App Store')).toBeVisible();
  await expect(page).toHaveTitle('Тестовое приложение 1 — Xstore');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/icons\//);
});

test('category pages page through with «Показать ещё»', async ({ page }) => {
  await page.goto('/category/igry');
  await expect(page.getByRole('heading', { level: 1, name: 'Игры' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Тестовое приложение/ }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Показать ещё' })).toHaveCount(0);
});

test('list page shows the collection', async ({ page }) => {
  await page.goto('/list/top');
  await expect(page.getByRole('heading', { level: 1, name: 'Самый загружаемый' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Тестовое приложение/ })).toHaveCount(12);
});

test('no horizontal overflow on home at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Самый загружаемый' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('home hero is light, sits under the pill and carries the XSTORE word', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const hero = page.locator('[data-home-hero]');
  expect((await hero.boundingBox())?.y).toBe(0);
  expect(await hero.evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(
    /rgb\(227, 237, 253\).*rgb\(242, 248, 253\)/,
  );
  const word = hero.locator('[aria-hidden="true"]', { hasText: 'XSTORE' });
  await expect(word).toHaveCount(1);
  await expect(word).toHaveCSS('color', 'rgb(255, 255, 255)');
  const title = page.getByRole('heading', { level: 1 });
  await expect(title).toHaveCSS('color', 'rgb(14, 26, 51)');
  const pill = await page.locator('header').first().locator('> div').first().boundingBox();
  const titleBox = await title.boundingBox();
  expect(titleBox?.y).toBeGreaterThan((pill?.y ?? 0) + (pill?.height ?? 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('install banner never covers the end of the page at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const banner = page.getByRole('complementary', { name: 'Установить Xstore' });
  await expect(banner).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const bannerTop = (await banner.boundingBox())?.y ?? 0;
  const lastRow = page.locator('main [role="listitem"], main li').last();
  const footerEnd = page.locator('footer').last();
  for (const loc of [lastRow, footerEnd]) {
    const box = await loc.boundingBox();
    if (box && box.y + box.height > 0 && box.y < 844) {
      expect(box.y + box.height).toBeLessThanOrEqual(bannerTop);
    }
  }
});

test('icon opens a morphing preview; Escape closes it and returns focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const trigger = page
    .getByRole('button', { name: 'Быстрый просмотр: Тестовое приложение 1' })
    .first();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Тестовое приложение 1' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Подробнее' })).toHaveAttribute(
    'href',
    '/app/testovoe-prilozhenie-1',
  );
  await expect(dialog.getByRole('link', { name: 'Установить' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('app screenshots sit in iPhone frames and the rail fits the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app/testovoe-prilozhenie-1');
  const rail = page.getByRole('list', { name: 'Скриншоты' });
  const shots = rail.getByRole('img');
  expect(await shots.count()).toBeGreaterThan(0);
  for (const shot of await shots.all()) {
    await expect(shot).toHaveAttribute('alt', /Скриншот \d+: Тестовое приложение 1/);
    expect(await shot.evaluate((el) => el.closest('[data-iphone-frame]') !== null)).toBe(true);
  }
  expect((await rail.boundingBox())?.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
