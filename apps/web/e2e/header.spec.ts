import { expect, type Locator, type Page, test } from '@playwright/test';

const css = (loc: Locator, prop: string, pseudo?: string) =>
  loc.evaluate((el, [p, ps]) => getComputedStyle(el, ps ?? null).getPropertyValue(p as string), [
    prop,
    pseudo,
  ] as const);

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

const pill = (page: Page) => page.locator('header').first().locator('> div').first();

test('floating white glass pill (desktop)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dev/ui?path=/faq');
  const header = page.locator('header').first();
  const box = await pill(page).boundingBox();
  expect(box?.y).toBeGreaterThanOrEqual(12);
  expect(box?.height).toBe(56);
  expect(await css(pill(page), 'border-radius')).toBe('999px');
  // Solid white pill (owner 2026-11-23), no see-through glass.
  expect(await css(pill(page), 'background-color', '::before')).toBe('rgb(255, 255, 255)');
  expect(await css(header, 'background-image')).toBe('none');
  await expect(page.locator('header [aria-hidden="true"][class*="tint"]')).toHaveCount(0);

  const active = page
    .getByRole('navigation', { name: 'Основное меню' })
    .getByRole('link', { name: 'Вопросы' });
  await expect(active).toHaveAttribute('aria-current', 'page');
  await expect(active).toHaveCSS('color', 'rgb(15, 95, 214)');
  await expect(active.locator('[data-nav-highlight]')).toHaveCSS(
    'background-color',
    'rgb(227, 237, 253)',
  );
  await expect(header.getByRole('link', { name: 'Войти' })).toHaveCSS('color', 'rgb(95, 107, 133)');
  expect(await noHorizontalScroll(page)).toBe(true);
});

test('desktop pill hugs its links and stays centred, not full width', async ({ page }) => {
  for (const auth of ['', 'auth=1&']) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/dev/ui?${auth}path=/faq`);
    const box = await pill(page).boundingBox();
    if (!box) throw new Error('no pill');
    // «Каталог» + three pages + «Войти» and «Подключить iPhone» (owner 2026-11-23).
    expect(box.width).toBeLessThanOrEqual(880);
    expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThanOrEqual(2);
  }
});

test('highlight follows the hovered item and returns to the active one', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dev/ui?auth=1&path=/faq');
  const nav = page.getByRole('navigation', { name: 'Основное меню' });
  await nav.getByRole('link', { name: 'Блог' }).hover();
  await expect(nav.getByRole('link', { name: 'Блог' }).locator('[data-nav-highlight]')).toHaveCount(
    1,
  );
  await page.mouse.move(5, 700);
  await expect(
    nav.getByRole('link', { name: 'Вопросы' }).locator('[data-nav-highlight]'),
  ).toHaveCount(1);
});

test('pill narrows after scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect(page.locator('header').first()).toHaveAttribute('data-scrolled', 'true');
  await expect.poll(async () => (await pill(page).boundingBox())?.height).toBe(48);
  await expect.poll(async () => (await pill(page).boundingBox())?.width).toBeLessThanOrEqual(896);
});

for (const width of [390, 768, 1280]) {
  test(`no horizontal scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/dev/ui?auth=1&path=/faq');
    expect(await noHorizontalScroll(page)).toBe(true);
  });
}

test('auth header fits at 768px', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/dev/ui?auth=1&path=/faq');
  expect((await pill(page).boundingBox())?.height).toBe(56);
  await expect(page.locator('header').first().getByRole('link', { name: 'Мой доступ' })).toHaveCSS(
    'color',
    'rgb(255, 255, 255)',
  );
});

test('no horizontal overflow at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/dev/ui');
  await expect(page.getByRole('button', { name: 'Меню' })).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
});

test('card menu opens under the pill and closes on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev/ui?auth=1');
  const burger = page.getByRole('button', { name: 'Меню' });
  await burger.click();
  const menu = page.getByRole('dialog');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('group')).toHaveCount(3);
  const pillBox = await pill(page).boundingBox();
  const firstCard = await menu.getByRole('group').first().boundingBox();
  expect(firstCard?.y).toBeGreaterThan((pillBox?.y ?? 0) + (pillBox?.height ?? 0));
  await expect(menu.getByRole('link', { name: 'Мой доступ' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(burger).toBeFocused();
});

test('focus ring stays visible in the open card menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev/ui');
  const burger = page.getByRole('button', { name: 'Меню' });
  await burger.click();
  const links = page.getByRole('dialog').getByRole('link');
  await expect(links.first()).toBeFocused();
  await links.last().focus();
  await page.keyboard.press('Tab');
  await expect(burger).toBeFocused();
  expect(await burger.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
  await expect(burger).toHaveCSS('outline-style', 'solid');
  await expect(burger).toHaveCSS('outline-color', 'rgb(34, 118, 243)');
});

test('iPhone status bar matches the sky on the home page and the ice elsewhere', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1e8fff');
  await page.goto('/faq');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f2f8fd');
});

test('«Каталог» panel opens under the pill on hover and closes on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dev/ui?path=/faq');
  const nav = page.getByRole('navigation', { name: 'Основное меню' });
  const button = nav.getByRole('button', { name: 'Каталог' });
  await expect(button).toHaveAttribute('aria-expanded', 'false');

  // A mouse opens it on hover; a touch screen (the iPhone project) by a tap.
  const mouse = await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches);
  if (mouse) await button.hover();
  else await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const panel = page.locator(`#${await button.getAttribute('aria-controls')}`);
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('link', { name: /Удалённые из App Store/ })).toHaveAttribute(
    'href',
    '/removed',
  );
  await expect(panel.getByRole('link', { name: 'Смотреть тарифы' })).toHaveAttribute(
    'href',
    '/pricing',
  );
  const pillBox = await pill(page).boundingBox();
  const box = await panel.boundingBox();
  if (!pillBox || !box) throw new Error('no box');
  expect(box.y).toBeGreaterThan(pillBox.y + pillBox.height);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(1280);
  expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThanOrEqual(2);
  expect(await noHorizontalScroll(page)).toBe(true);

  if (mouse) {
    // Moving over the gap into the panel keeps it open.
    await panel.getByRole('link', { name: /Популярные/ }).hover();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
  }

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(button).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await page.mouse.click(5, 700);
  await expect(button).toHaveAttribute('aria-expanded', 'false');
});

test('«Каталог» is not in the phone pill', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev/ui?path=/faq');
  await expect(page.getByRole('button', { name: 'Каталог' })).toBeHidden();
});

test('no word «Xstorex» in the header on a phone and a computer (owner 2026-11-23)', async ({
  page,
}) => {
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/dev/ui?path=/faq');
    await expect(page.locator('header').first().getByText('Xstorex')).toHaveCount(0);
    expect(await noHorizontalScroll(page)).toBe(true);
  }
});

test('on a phone the pill holds only the menu', async ({ page }) => {
  for (const auth of ['', 'auth=1&']) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/dev/ui?${auth}path=/faq`);
    const header = page.locator('header').first();
    await expect(header.getByText('Xstorex')).toHaveCount(0);
    const burger = header.getByRole('button', { name: 'Меню' });
    await expect(burger).toBeVisible();
    await expect(header.getByRole('link', { name: 'Тарифы' })).toHaveCount(0);
    // Owner 2026-11-23: no person icon and no «Подключить» in the phone pill.
    await expect(header.getByRole('link', { name: 'Войти' })).toBeHidden();
    await expect(header.getByRole('link', { name: 'Мой доступ' })).toBeHidden();
    await expect(header.getByRole('link', { name: /^Подключить/ })).toBeHidden();
    const pillBox = await pill(page).boundingBox();
    const burgerBox = await burger.boundingBox();
    if (!pillBox || !burgerBox) throw new Error('no box');
    expect(pillBox.x + pillBox.width - (burgerBox.x + burgerBox.width)).toBeLessThanOrEqual(12);
    // «Подключить», pricing and «Войти» / «Мой доступ» stay one tap away, in the menu.
    await burger.click();
    const menu = page.getByRole('dialog');
    await expect(menu.getByRole('link', { name: auth ? 'Мой доступ' : 'Войти' })).toBeVisible();
    if (!auth) {
      await expect(menu.getByRole('link', { name: 'Тарифы' })).toBeVisible();
      await expect(menu.getByRole('link', { name: 'Подключить iPhone' })).toHaveAttribute(
        'href',
        '/get',
      );
    }
    await page.keyboard.press('Escape');
  }
});

test('phone menu button is glass on every page (owner 2026-11-23)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const burger = page.locator('header').first().getByRole('button', { name: 'Меню' });
  // Over the home sky: clear glass with white lines.
  expect(await css(pill(page), 'background-color', '::before')).toBe('rgba(255, 255, 255, 0.22)');
  expect(await css(pill(page), 'backdrop-filter', '::before')).toContain('blur');
  await expect(burger).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(burger).toHaveCSS('color', 'rgb(255, 255, 255)');
  // Off the sky the page is white: frosted glass with blue lines.
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect(page.locator('header').first()).toHaveAttribute('data-scrolled', 'true');
  await expect
    .poll(() => css(pill(page), 'background-color', '::before'))
    .toBe('rgba(255, 255, 255, 0.55)');
  expect(await css(pill(page), 'backdrop-filter', '::before')).toContain('blur');
  await expect(burger).toHaveCSS('color', 'rgb(26, 110, 234)');

  // Every other page: the same frosted glass, no pale circle inside it.
  await page.goto('/dev/ui?path=/faq');
  const plain = page.locator('header').first().getByRole('button', { name: 'Меню' });
  expect(await css(pill(page), 'background-color', '::before')).toBe('rgba(255, 255, 255, 0.55)');
  expect(await css(pill(page), 'backdrop-filter', '::before')).toContain('blur');
  await expect(plain).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(plain).toHaveCSS('color', 'rgb(26, 110, 234)');
});
