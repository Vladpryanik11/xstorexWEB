import { expect, test } from '@playwright/test';

// Data comes from `pnpm --filter @xstore/db seed:e2e` (global setup).

test('home shows collections and an app opens its install sheet', async ({ page, isMobile }) => {
  await page.goto('/');
  // Owner 2026-11-23 (spec 2026-11-23-home-first-screen §3).
  await expect(
    page.getByRole('heading', { level: 1, name: 'Удаленные из App Store снова доступны' }),
  ).toBeVisible();
  await expect(page.locator('[data-hero-cta]')).toHaveAttribute('href', '/get');
  // Owner 2026-11-24: the second search «Ищете конкретное приложение?» left the home page.
  await expect(page.getByRole('heading', { name: 'Ищете конкретное приложение?' })).toHaveCount(0);
  await expect(page.getByRole('search')).toHaveCount(1);
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
  // The seeded icons come from object storage. The hero lanes move all the time, so the
  // check takes an icon from the collections below them.
  const icon = page.locator('img[src*="/icons/"]:visible:not([data-hero-lanes] img)').first();
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
    /rgb\(0, 102, 224\) 0%.*rgb\(10, 132, 255\) 20%.*rgb\(42, 168, 255\) 36%/,
  );
  expect((await sky.boundingBox())?.y).toBe(0);
  const phone = hero.locator('[data-hero-phone]');
  await expect(phone).toBeHidden();
  const title = page.getByRole('heading', { level: 1 });
  await expect(title).toHaveCSS('color', 'rgb(255, 255, 255)');
  // Owner 2026-11-24 («как у Apple», Б; «грязновато» → чистый вариант 2): no shadow or haze on
  // the text at all; the deep blue reaches down past the subtitle instead.
  expect(await title.evaluate((el) => getComputedStyle(el).textShadow)).toBe('none');
  const subtitle = hero.getByText(/Премиум подписки/);
  expect(await subtitle.evaluate((el) => getComputedStyle(el).textShadow)).toBe('none');
  await expect(subtitle).toHaveCSS('font-weight', '500');
  await expect(subtitle).toHaveCSS('color', 'rgb(255, 255, 255)');
  const pill = await page.locator('header').first().locator('> div').first().boundingBox();
  const titleBox = await title.boundingBox();
  expect(titleBox?.y).toBeGreaterThan((pill?.y ?? 0) + (pill?.height ?? 0));
  // Owner 2026-11-24, «Мягкий переход»: the sky is twice as tall and melts into white by the
  // audience line; it stays inside the hero and lies under every block.
  const skyBox = await sky.boundingBox();
  const heroBox = await hero.boundingBox();
  const promises = await hero.getByRole('list', { name: 'Без лишнего' }).boundingBox();
  const skyBottom = (skyBox?.y ?? 0) + (skyBox?.height ?? 0);
  const heroBottom = (heroBox?.y ?? 0) + (heroBox?.height ?? 0);
  // 53rem, or down to the end of the hero when the hero is shorter.
  expect(skyBox?.height ?? 0).toBeGreaterThanOrEqual(Math.min(848, heroBottom) - 1);
  expect(skyBottom).toBeGreaterThan((promises?.y ?? 0) + (promises?.height ?? 0));
  expect(skyBottom).toBeLessThanOrEqual(heroBottom);
  expect(
    await sky.evaluate((el) => {
      const bg = getComputedStyle(el).backgroundImage;
      return bg.match(/rgba?\([^)]*\)/g)?.length ?? 0;
    }),
  ).toBeGreaterThanOrEqual(8);
  const audience = hero.locator('[data-hero-audience]');
  await audience.scrollIntoViewIfNeeded();
  expect(
    await audience.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit !== null && el.contains(hit);
    }),
  ).toBe(true);
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

test('the first screen: lanes, search, button, promises and the audience above the fold', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  const hero = page.locator('[data-home-hero]');
  const parts = [
    hero.locator('[data-hero-lanes]'),
    hero.getByRole('search'),
    hero.locator('[data-hero-cta]'),
    hero.getByRole('list', { name: 'Без лишнего' }),
    hero.locator('[data-hero-audience]'),
  ];
  const boxes = await Promise.all(parts.map((l) => l.boundingBox()));
  const ys = boxes.map((b) => b?.y ?? -1);
  expect(ys).toEqual([...ys].sort((x, y) => x - y));
  // Owner 2026-11-24: one lane of removed and premium apps, no caption above it.
  await expect(hero.locator('[data-hero-lane]')).toHaveCount(1);
  await expect(hero.locator('[data-lane-caption]')).toHaveCount(0);
  await expect(hero.locator('[data-hero-cta]')).toHaveAttribute('href', '/get');
  // The line's words (the photos beside them carry no text).
  await expect(hero.locator('[data-hero-audience]')).toContainText(
    'Более 10 000 пользователей в\u00a0месяц',
  );
  await expect(hero.locator('[data-hero-audience] [data-avatar]')).toHaveCount(3);
  const viewport = page.viewportSize();
  // The lanes run from edge to edge of a phone; the screen cuts them, the page does not scroll sideways.
  if (isMobile) {
    const lanes = boxes[0];
    expect(lanes?.x).toBe(0);
    expect(lanes?.width).toBe(viewport?.width);
    // Owner 2026-11-24 («сетка Apple»): a 48px pill; the whole first screen is one phone screen.
    const cta = boxes[2];
    expect(cta?.height).toBe(48);
    expect(cta?.width).toBeGreaterThan(300);
    const proof = boxes[4];
    expect((proof?.y ?? 9999) + (proof?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);
    // Owner 2026-11-24 («равномерно», variant 4; «низ», variant А): the hero is one screen tall and
    // its free space goes in equal parts above the lane, above the search and above the button; the
    // audience line sits right under the promises.
    const heroBox = await hero.boundingBox();
    expect(Math.abs((heroBox?.height ?? 0) - (viewport?.height ?? 0))).toBeLessThanOrEqual(1);
    const sub = await hero.getByText(/Премиум подписки/).boundingBox();
    const bottom = (b: typeof sub | undefined) => (b?.y ?? 0) + (b?.height ?? 0);
    // The grey «200+» line belongs to the search (owner 2026-11-24, А3): the air above the button
    // is counted from it.
    const count = await hero.locator('[data-hero-count]').boundingBox();
    const gaps = [(boxes[0]?.y ?? 0) - bottom(sub), (boxes[1]?.y ?? 0) - bottom(boxes[0])];
    for (const g of gaps) expect(Math.abs(g - (gaps[0] ?? 0))).toBeLessThanOrEqual(2);
    expect(gaps[0] ?? 0).toBeGreaterThanOrEqual(12);
    // Owner 2026-11-24 09:09–09:11: the button stands a little above the middle between the
    // «200+» line and the promises, with a small blue «Как это работает?» under it.
    const how = await hero.getByRole('button', { name: 'Как это работает?' }).boundingBox();
    const above = (boxes[2]?.y ?? 0) - bottom(count);
    const below = (boxes[3]?.y ?? 0) - bottom(how);
    expect(above).toBeLessThanOrEqual(below);
    expect(above).toBeGreaterThanOrEqual(12);
    const underPromises = (boxes[4]?.y ?? 0) - bottom(boxes[3]);
    expect(underPromises).toBeGreaterThanOrEqual(14);
    expect(underPromises).toBeLessThanOrEqual(26);
    // The lane is cut at the screen edges only, so the icon shadows below are not cut into a line.
    await expect(hero.locator('[data-hero-lanes]')).toHaveCSS('overflow-y', 'visible');
    // Owner 2026-11-24: no three steps on the first screen any more.
    await expect(hero.getByRole('list', { name: 'Три шага' })).toHaveCount(0);
  } else {
    expect(boxes[0]?.x).toBe(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

// Owner 2026-11-24, «Лента как Dock» (spec 2026-11-23-home-first-screen): the lane drifts on its
// own, the middle icon is larger, and typing a name moves that app to the middle of the lane.
test('the first-screen lane is a Dock: it drifts, and the search brings the app to its middle', async ({
  page,
}) => {
  await page.goto('/');
  const hero = page.locator('[data-home-hero]');
  const track = hero.locator('[data-hero-lane] [data-lane-track]');
  const left = () => track.evaluate((el) => el.scrollLeft);
  const start = await left();
  await expect.poll(left, { timeout: 6000 }).not.toBe(start);
  // The 200+ line sits right under the search, in grey.
  const count = hero.locator('[data-hero-count]');
  await expect(count).toHaveText('200+ приложений');
  await expect(count).toHaveCSS('color', 'rgb(110, 110, 115)');
  const [field, line] = await Promise.all([
    hero.getByRole('search').boundingBox(),
    count.boundingBox(),
  ]);
  const gap = (line?.y ?? 0) - ((field?.y ?? 0) + (field?.height ?? 0));
  expect(gap).toBeGreaterThanOrEqual(12);
  expect(gap).toBeLessThanOrEqual(16);

  await hero.getByRole('searchbox').fill('Тестовое приложение 1');
  // The apps found stay bright, the others fade; the field says how many were found.
  await expect(
    track.locator('a[data-hit][href="/?app=testovoe-prilozhenie-1"]').first(),
  ).toBeAttached();
  await expect(track.locator('a[data-dim]').first()).toBeAttached();
  await expect(hero.getByRole('search')).toContainText('Нашли');
  await expect(hero.locator('[data-lane-name]')).toHaveText('Тестовое приложение 1');
  // In the middle of the lane, and larger than its neighbours.
  const middle = await track.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const hits = [...el.querySelectorAll('a[data-hit] img')].map((i) => i.getBoundingClientRect());
    const near = hits.sort(
      (a, b) =>
        Math.abs(a.x + a.width / 2 - (box.x + box.width / 2)) -
        Math.abs(b.x + b.width / 2 - (box.x + box.width / 2)),
    )[0];
    const any = el.querySelector('a:not([data-hit]) img')?.getBoundingClientRect();
    return {
      off: Math.abs((near?.x ?? 0) + (near?.width ?? 0) / 2 - (box.x + box.width / 2)),
      ratio: (near?.width ?? 0) / (any?.width ?? 1),
      x: (near?.x ?? 0) + (near?.width ?? 0) / 2,
      y: (near?.y ?? 0) + (near?.height ?? 0) / 2,
    };
  });
  expect(middle.off).toBeLessThanOrEqual(4);
  expect(middle.ratio).toBeGreaterThan(1.3);

  // A tap on the ringed icon in the middle opens its install sheet.
  await page.mouse.click(middle.x, middle.y);
  await expect(page.getByRole('dialog', { name: 'Тестовое приложение 1' })).toBeVisible();
});

// Owner 2026-11-24 09:12: «Как это работает?» opens the steps over the page.
test('«Как это работает?» under the button opens the steps without leaving the page', async ({
  page,
}) => {
  await page.goto('/');
  const hero = page.locator('[data-home-hero]');
  await hero.getByRole('button', { name: 'Как это работает?' }).click();
  const dialog = page.getByRole('dialog', { name: 'Как это работает' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await dialog.getByRole('button', { name: 'Дальше' }).click();
  await dialog.getByRole('button', { name: 'Дальше' }).click();
  await expect(dialog.getByRole('link', { name: 'Подключить iPhone' })).toHaveAttribute(
    'href',
    '/get',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('the first-screen search says when the catalog has no such app', async ({ page }) => {
  await page.goto('/');
  const hero = page.locator('[data-home-hero]');
  await hero.getByRole('searchbox').fill('Такого нет точно');
  const count = hero.locator('[data-hero-count]');
  await expect(count).toHaveText('Такого приложения пока нет в каталоге');
  await hero.getByRole('searchbox').fill('');
  await expect(count).toHaveText('200+ приложений');
});

test('the lane stands still under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const track = page.locator('[data-hero-lane] [data-lane-track]');
  // The lane first stands on its middle copy once the page is live; only then it must not move.
  await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  const start = await track.evaluate((el) => el.scrollLeft);
  await page.waitForTimeout(3000);
  expect(await track.evaluate((el) => el.scrollLeft)).toBe(start);
});

test('home blocks follow the «Проверь и купи» order', async ({ page }) => {
  await page.goto('/');
  const names = [
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
