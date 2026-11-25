import { expect, test } from '@playwright/test';

// Owner 2026-11-25 («навести порядок для ПК-версии», пункты 5–9, mockup
// https://claude.ai/artifact/VZXYCVZgQ9pCZAG85DbK6y): every page in the design of the home page.

for (const path of ['/removed', '/pricing', '/faq', '/terms']) {
  test(`${path}: white page, heading in the font of the home title`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveCSS('font-family', /Inter Tight/i);
    await expect(h1).toHaveCSS('font-weight', '600');
  });
}

test('one button on the whole site: flat Apple blue, no shadow', async ({ page }) => {
  await page.goto('/signin');
  const button = page.getByRole('button', { name: 'Войти', exact: true });
  await expect(button).toHaveCSS('background-color', 'rgb(0, 113, 227)');
  await expect(button).toHaveCSS('box-shadow', 'none');
});

test('«Тарифы» shows the plan card of the home page', async ({ page }) => {
  await page.goto('/pricing');
  const card = page.getByRole('region', { name: 'Весь каталог в одной подписке' }).locator('> div');
  expect(await card.evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(
    /linear-gradient\(.*rgb\(0, 102, 224\)/,
  );
  await expect(card.getByRole('link')).toHaveAttribute('href', '/get');
  await expect(page.getByRole('region', { name: 'Частые вопросы' })).toBeVisible();
});

test('the footer names Xstorex and writes to support, with no dead links', async ({ page }) => {
  await page.goto('/faq');
  const footer = page.locator('footer');
  await expect(footer.getByRole('link', { name: 'Xstorex', exact: true })).toHaveAttribute('href', '/');
  await expect(footer.getByRole('link', { name: 'support@xstorex.app' })).toHaveAttribute(
    'href',
    'mailto:support@xstorex.app',
  );
  await expect(footer.getByText('© 2026 Xstorex')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Блог' })).toHaveCount(0);
  for (const href of await page
    .locator('header a[href^="/"], footer a[href^="/"]')
    .evaluateAll((links) => [...new Set(links.map((a) => a.getAttribute('href') ?? ''))])) {
    const res = await page.request.get(href.replace(/#.*$/, ''));
    expect(res.status(), href).toBeLessThan(400);
  }
});
