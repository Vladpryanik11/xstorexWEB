import { expect, test } from '@playwright/test';

// Data comes from `pnpm --filter @xstore/db seed:e2e` (global setup).

test('home shows collections and an app opens its install sheet', async ({ page, isMobile }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Приложения для iPhone и iPad' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Найдите нужное приложение, оплатите и установите его прямо с сайта. Регистрация не нужна.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Популярное' })).toBeVisible();
  await page
    .getByRole('button', { name: /^Тестовое приложение 1(?!\d)/ })
    .first()
    .click();
  const sheet = page.getByRole('dialog', { name: 'Тестовое приложение 1' });
  await expect(sheet).toBeVisible();
  // A guest pays first: «Установить» on iPhone, «Оформить доступ» on a computer.
  await expect(
    sheet.getByRole('link', { name: isMobile ? 'Установить' : 'Оформить доступ' }),
  ).toHaveAttribute('href', '/get?app=testovoe-prilozhenie-1');
  await expect(sheet.getByRole('link', { name: 'Войти' })).toHaveAttribute(
    'href',
    /\/signin\?next=/,
  );
  await expect(sheet.getByText('Уже оплачивали?')).toBeVisible();
  await expect(sheet.getByRole('link', { name: 'Подробнее' })).toHaveCount(0);
});

test('home explains how it works and has no install banner', async ({ page }) => {
  await page.goto('/');
  const how = page.getByRole('region', { name: 'Как это работает' });
  for (const step of ['Найдите приложение', 'Оплатите', 'Установите']) {
    await expect(how.getByRole('heading', { name: step })).toBeVisible();
  }
  await expect(
    how.getByText('Только приложения с правами на распространение. Никаких взломанных версий.'),
  ).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Установить Xstore' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('home renders every collection layout and the category chips', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('list', { name: 'Баннеры' })).toBeVisible();
  for (const title of ['Популярное', 'Набирают популярность', 'Больше нет в App Store']) {
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
  await expect(page.getByRole('button', { name: /^Тестовое приложение 1(?!\d)/ })).toBeVisible();
  await expect(page.getByText('Скрытое тестовое приложение')).toHaveCount(0);
});

test('search explains short and empty queries', async ({ page }) => {
  await page.goto('/search?q=т');
  await expect(page.getByText('Введите хотя бы две буквы')).toBeVisible();
  await page.goto('/search?q=несуществующее');
  await expect(
    page.getByText(
      'По запросу «несуществующее» ничего нет. Проверьте написание или попробуйте другое название.',
    ),
  ).toBeVisible();
});

test('hidden app is 404', async ({ page }) => {
  const res = await page.goto('/app/hidden-app');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Такой страницы нет' })).toBeVisible();
});

test('an old app link opens the install sheet over the home page', async ({ page, isMobile }) => {
  await page.goto('/app/testovoe-prilozhenie-1');
  await expect(page).toHaveURL(/\/\?app=testovoe-prilozhenie-1$/);
  const sheet = page.getByRole('dialog', { name: 'Тестовое приложение 1' });
  await expect(sheet).toBeVisible();
  // On iPhone the sheet lists the steps; on a computer it says where the app installs.
  if (isMobile) {
    await expect(
      sheet.getByRole('list', { name: 'Как установить' }).getByRole('listitem'),
    ).toHaveCount(3);
  } else {
    await expect(sheet.getByText(/Установить можно с iPhone или iPad/)).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/?app=hidden-app');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('category pages page through with «Показать ещё»', async ({ page }) => {
  await page.goto('/category/igry');
  await expect(page.getByRole('heading', { level: 1, name: 'Игры' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Тестовое приложение/ }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Показать ещё' })).toHaveCount(0);
});

test('list page shows the collection', async ({ page }) => {
  await page.goto('/list/top');
  await expect(page.getByRole('heading', { level: 1, name: 'Популярное' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Тестовое приложение/ })).toHaveCount(12);
});

test('no horizontal overflow on home at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Популярное' })).toBeVisible();
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

test('an app morphs into its sheet; Escape closes it and returns focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: /^Тестовое приложение 1(?!\d)/ }).first();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Тестовое приложение 1' });
  await expect(dialog).toBeVisible();
  // The button waits for the access check; a guest then gets the payment link.
  await expect(
    dialog.getByRole('link', { name: /^(Установить|Оформить доступ)$/ }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('home tiles open the catalog sections, shown as icons', async ({ page }) => {
  await page.goto('/');
  const tiles = page.getByRole('navigation', { name: 'Разделы каталога' });
  await tiles.getByRole('link', { name: /Удалённые из App Store/ }).click();
  await expect(page).toHaveURL(/\/removed$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Удалённые из App Store' }),
  ).toBeVisible();
  const grid = page.getByRole('list', { name: 'Удалённые из App Store' });
  await expect(grid.getByRole('button', { name: /^Тестовое приложение 1$/ })).toBeVisible();
  await expect(grid.getByRole('button', { name: /^Тестовое приложение 5$/ })).toHaveCount(0);

  await page.goto('/catalog');
  // The admin spec may publish more apps into the shared test database: check the seeded ones.
  const all = page.getByRole('list', { name: 'Весь каталог' });
  for (const n of [1, 12]) {
    await expect(
      all.getByRole('button', { name: new RegExp(`^Тестовое приложение ${n}$`) }),
    ).toBeVisible();
  }
  await page.goto('/premium');
  await expect(page.getByText('Здесь пока пусто. Скоро добавим приложения.')).toBeVisible();
});

test('category chips do not widen the catalog and category pages', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/catalog', '/category/igry']) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
