import { devices, expect, test } from '@playwright/test';
import { buyAsGuest, buyerEmail } from './fixtures/purchase';

// Spec v2 §4 step 2a: a guest who paid in Chrome on an iPhone is sent to Safari with a one-time
// sign-in link; Safari opens the connect step signed in, without a password or a code.

const IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';
const SITE = 'http://localhost:3100';
const CHROME_IOS = `${IOS} CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1`;

test('Chrome on iPhone → «Осталось открыть в Safari» → Safari is signed in by the link, once', async ({
  browser,
  isMobile,
}, testInfo) => {
  test.skip(!isMobile, 'the iPhone screens');
  const { defaultBrowserType: _, ...iphone } = devices['iPhone 15'];
  const chrome = await browser.newContext({ ...iphone, baseURL: SITE, userAgent: CHROME_IOS });
  const safari = await browser.newContext({ ...iphone, baseURL: SITE });
  const late = await browser.newContext({ ...iphone, baseURL: SITE });
  try {
    const page = await chrome.newPage();
    await buyAsGuest(page, buyerEmail(testInfo, 'safari-handoff'));
    await page.goto('/get/iphone');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Осталось открыть в Safari' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Подключить iPhone', exact: true })).toHaveCount(0);
    await expect(
      page.getByText('Не открылось? Скопируйте ссылку и вставьте её в Safari.'),
    ).toBeVisible();
    await expect(
      page.getByText('Подключить iPhone можно только в Safari. Вход сохранится.'),
    ).toBeVisible();

    // The address of the page carries the link, for «⋯ → Открыть в Safari».
    await expect(page).toHaveURL(/\/get\/iphone\?h=[A-Za-z0-9_-]{43}$/);
    const href = await page.getByRole('link', { name: 'Открыть в Safari' }).getAttribute('href');
    expect(href).toMatch(/^x-safari-http:\/\/localhost:\d+\/get\/iphone\?h=[A-Za-z0-9_-]{43}$/);
    const link = new URL((href ?? '').replace(/^x-safari-/, ''));
    expect(link.search).toBe(new URL(page.url()).search);

    // Safari: signed in by the link, on the usual step, the token gone from the address.
    const phone = await safari.newPage();
    await phone.goto(`${link.pathname}${link.search}`);
    await expect(phone).toHaveURL(/\/get\/iphone$/);
    await expect(phone.getByRole('heading', { level: 1, name: 'Подключить iPhone' })).toBeVisible();
    await expect(phone.getByText('Работает только в Safari')).toBeVisible();

    // A second browser with the same link: sign in by code instead.
    const other = await late.newPage();
    await other.goto(`${link.pathname}${link.search}`);
    await expect(other).toHaveURL(/\/signin\?next=(%2F|\/)get(%2F|\/)iphone&handoff=expired$/);
    await expect(
      other.getByText('Ссылка для входа устарела. Войдите по коду из письма'),
    ).toBeVisible();
  } finally {
    await chrome.close();
    await safari.close();
    await late.close();
  }
});
