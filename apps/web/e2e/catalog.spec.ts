import { expect, test } from '@playwright/test';

// Data comes from `pnpm --filter @xstore/db seed:e2e` (global setup).

test('home shows collections and an app opens its install sheet', async ({ page, isMobile }) => {
  await page.goto('/');
  // Owner 2026-11-23 (spec 2026-11-23-home-first-screen §3).
  await expect(
    page.getByRole('heading', { level: 1, name: 'Удаленные из App Store снова доступны' }),
  ).toBeVisible();
  await expect(page.locator('[data-hero-cta]')).toHaveAttribute('href', '/get');
  await expect(page.getByRole('heading', { name: 'Ищете конкретное приложение?' })).toBeVisible();
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
  for (const step of ['Оплатите', 'Подключите iPhone', 'Установите']) {
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
  const icon = page.locator('img[src*="/icons/"]:visible').first();
  await expect(icon).toBeVisible();
  // Shelf icons load lazily; bring one on screen before checking it decoded.
  await icon.scrollIntoViewIfNeeded();
  await expect
    .poll(() => icon.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
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

test('home hero: bright sky with white text under the pill; the iPhone is for wide screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const hero = page.locator('[data-home-hero]');
  expect((await hero.boundingBox())?.y).toBe(0);
  // Owner 2026-11-23: «Яркое небо, белый текст» (spec 2026-11-23-home-first-screen §4).
  const sky = hero.locator('[data-hero-sky]');
  expect(await sky.evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(
    /rgb\(30, 143, 255\).*rgb\(62, 198, 255\)/,
  );
  expect((await sky.boundingBox())?.y).toBe(0);
  const phone = hero.locator('[data-hero-phone]');
  await expect(phone).toBeHidden();
  const title = page.getByRole('heading', { level: 1 });
  await expect(title).toHaveCSS('color', 'rgb(255, 255, 255)');
  expect(await title.evaluate((el) => getComputedStyle(el).textShadow)).not.toBe('none');
  const pill = await page.locator('header').first().locator('> div').first().boundingBox();
  const titleBox = await title.boundingBox();
  expect(titleBox?.y).toBeGreaterThan((pill?.y ?? 0) + (pill?.height ?? 0));
  // The sky turns white before the search.
  const skyBox = await sky.boundingBox();
  const search = await hero.getByRole('search').boundingBox();
  expect((skyBox?.y ?? 0) + (skyBox?.height ?? 0)).toBeLessThanOrEqual(search?.y ?? 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(phone).toBeVisible();
  expect(await phone.locator('[data-app] img').count()).toBeGreaterThan(0);
});

test('an app morphs into its sheet; Escape closes it and returns focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: /^Тестовое приложение 1(?!\d)/ }).first();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Тестовое приложение 1' });
  await expect(dialog).toBeVisible();
  // The button waits for the access check; a guest then gets the payment link.
  await expect(dialog.getByRole('link', { name: /^(Установить|Оформить доступ)$/ })).toBeVisible();
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

test('on a phone the offer button follows the visitor once the hero scrolls away', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  // The header carries its own «Подключить» (owner 2026-11-23); count the page buttons only.
  const buttons = page.locator('main').getByRole('link', { name: 'Подключить iPhone' });
  await expect(buttons).toHaveCount(1);
  await page.getByRole('heading', { name: 'Как это работает' }).scrollIntoViewIfNeeded();
  await expect(buttons).toHaveCount(isMobile ? 2 : 1);
  await page.locator('footer').scrollIntoViewIfNeeded();
  await expect(buttons).toHaveCount(1);
});

test('the first screen: ticks, banner, search, button, guarantee and 10 000+ above the fold', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  const hero = page.locator('[data-home-hero]');
  const parts = [
    hero.getByRole('list', { name: 'Без лишнего' }),
    hero.locator('[data-hero-banner]'),
    hero.getByRole('search'),
    hero.locator('[data-hero-cta]'),
    hero.getByText('Гарантия на весь срок подписки'),
    hero.getByText('пользователей в месяц'),
  ];
  const boxes = await Promise.all(parts.map((l) => l.boundingBox()));
  const ys = boxes.map((b) => b?.y ?? -1);
  expect(ys).toEqual([...ys].sort((x, y) => x - y));
  await expect(hero.locator('[data-hero-icons] [data-icon]')).toHaveCount(5);
  await expect(hero.locator('[data-hero-cta]')).toHaveAttribute('href', '/get');
  if (isMobile) {
    // Sizes variant А: a 56px full-width button; 10 000+ ends above the 660px fold.
    const cta = boxes[3];
    expect(cta?.height).toBeGreaterThanOrEqual(55);
    expect(cta?.width).toBeGreaterThan(300);
    const proof = boxes[5];
    expect((proof?.y ?? 9999) + (proof?.height ?? 0)).toBeLessThanOrEqual(660);
    // The three steps start under the first screen.
    const steps = await hero.getByRole('list', { name: 'Три шага' }).boundingBox();
    expect(steps?.y ?? 0).toBeGreaterThan(proof?.y ?? 0);
  }
});

test('home blocks follow the «Проверь и купи» order', async ({ page }) => {
  await page.goto('/');
  const names = [
    'Ищете конкретное приложение?',
    'Как это работает',
    'Почему Xstorex',
    'Весь каталог на 1 месяц',
    'Популярное',
    'Частые вопросы',
    'Ваши приложения уже ждут',
  ];
  const ys: number[] = [];
  for (const name of names) {
    const box = await page.getByRole('heading', { name, exact: true }).first().boundingBox();
    ys.push(box?.y ?? -1);
  }
  expect(ys).toEqual([...ys].sort((a, b) => a - b));
  await expect(
    page.getByRole('list', { name: 'Xstorex в цифрах' }).getByRole('listitem'),
  ).toHaveCount(3);
});

test('the benefits panel is for wide screens only', async ({ page, isMobile }) => {
  await page.goto('/');
  const panel = page.getByRole('region', { name: 'Преимущества Xstorex' });
  if (isMobile) await expect(panel).toBeHidden();
  else await expect(panel.getByRole('listitem')).toHaveCount(4);
});

test('home sells the plan: price card, reasons, questions and a last call', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  const plan = page.getByRole('region', { name: 'Весь каталог на 1 месяц' });
  await expect(plan.getByText(/₽\s*в месяц/)).toBeVisible();
  const buy = plan.getByRole('link', { name: /^Получить доступ за\s.+₽$/ });
  await expect(buy).toHaveAttribute('href', '/get');
  await expect(
    page.getByRole('region', { name: 'Почему Xstorex' }).getByRole('heading', { level: 3 }),
  ).toHaveCount(4);
  await expect(page.getByRole('region', { name: 'Частые вопросы' }).locator('summary')).toHaveCount(
    4,
  );
  const last = page.getByRole('region', { name: 'Ваши приложения уже ждут' });
  await expect(last.getByRole('link', { name: /^Получить доступ за/ })).toHaveAttribute(
    'href',
    '/get',
  );
  if (isMobile) {
    // The sticky button never doubles the plan button: only the hero one stays in the page.
    await buy.scrollIntoViewIfNeeded();
    await expect(page.getByRole('link', { name: 'Подключить iPhone' })).toHaveCount(1);
  }
});
