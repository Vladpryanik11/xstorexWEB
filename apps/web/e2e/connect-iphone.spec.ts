import { type APIRequestContext, devices, expect, type Page, test } from '@playwright/test';
import { deviceAnswer, randomUdid, readProfile } from './fixtures/ios';
import { buyAsGuest, buyerEmail, loginCode, paidUntil, payOnGetPage } from './fixtures/purchase';

// Н2: connecting an iPhone. iOS is played by the test: it takes the file the page downloads and
// posts a signed answer (test device under the e2e test root, see fixtures/ios.ts) to the URL in
// the file, without the site's cookies, as the iOS profile service does.

const SITE = 'http://localhost:3100';
const APP = 'Тестовое приложение 1';

/** On `/get/iphone`: «Подключить iPhone» → file → iOS answers → «Готово, iPhone подключён». */
async function connectIphone(page: Page, ios: APIRequestContext): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: 'Подключить iPhone' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Подключить iPhone', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('xstore-connect.mobileconfig');
  const chunks: Buffer[] = [];
  for await (const chunk of await file.createReadStream()) chunks.push(chunk as Buffer);
  const { challenge, url } = await readProfile(Buffer.concat(chunks));
  expect(url).toBe(`${SITE}/api/v1/enrollment/callback?s=${challenge}`);

  // Settings is installing: Safari waits.
  await expect(page.getByRole('heading', { level: 1, name: 'Ждём подключения…' })).toBeVisible();
  await expect(page.getByText('Вернитесь в Safari, когда нажмёте «Установить»')).toBeVisible();

  const answer = await deviceAnswer({
    UDID: randomUdid(),
    PRODUCT: 'iPhone16,1',
    VERSION: '22B83',
    CHALLENGE: challenge,
  });
  const res = await ios.post(url, {
    headers: { 'Content-Type': 'application/pkcs7-signature' },
    data: answer,
    maxRedirects: 0,
  });
  expect(res.status()).toBe(301);
  expect(res.headers().location).toBe(`${SITE}/get/iphone?r=connected`);

  // Back in Safari the waiting page sees the device by itself.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Готово, iPhone подключён' }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Готовим ваш iPhone, обычно до 24 часов')).toBeVisible();
  // The page iOS is sent to says the same.
  await page.goto(res.headers().location as string);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Готово, iPhone подключён' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

/** The app window: «Готовим ваш iPhone…» until the device is ready, then «Скоро…» (installs: Н4). */
async function windowFollowsDevice(page: Page): Promise<void> {
  await page.goto('/?app=testovoe-prilozhenie-1');
  const sheet = page.getByRole('dialog', { name: APP });
  await expect(
    sheet.getByRole('button', { name: 'Готовим ваш iPhone, обычно до 24 часов' }),
  ).toBeDisabled();

  // Development switch until device registration exists (XSTORE_DEV_PAGES=1 in the e2e API).
  const ready = await page.request.post('/api/v1/devices/dev/mine/ready', {
    headers: { Origin: SITE },
  });
  expect(ready.status()).toBe(204);
  await page.reload();
  await expect(
    page.getByRole('dialog', { name: APP }).getByRole('button', {
      name: 'Скоро можно будет установить',
    }),
  ).toBeDisabled();
  await page.goto('/get/iphone');
  await expect(page.getByRole('heading', { level: 1, name: 'iPhone готов' })).toBeVisible();
}

test('iPhone: pay → connect in Safari → «Готово, iPhone подключён» → window follows the device', async ({
  page,
  isMobile,
  playwright,
}, testInfo) => {
  test.skip(!isMobile, 'connecting happens on the iPhone itself');
  const email = buyerEmail(testInfo, 'connect');
  await buyAsGuest(page, email);
  await page.getByRole('link', { name: 'Дальше: подключить iPhone' }).click();
  await expect(page).toHaveURL(/\/get\/iphone$/);

  const ios = await playwright.request.newContext();
  try {
    await connectIphone(page, ios);
  } finally {
    await ios.dispose();
  }
  await windowFollowsDevice(page);
});

test('computer pays → «Откройте сайт на iPhone» → iPhone signs in by code and connects', async ({
  page,
  isMobile,
  playwright,
}, testInfo) => {
  test.skip(isMobile, 'a computer pays here; the iPhone is a WebKit browser of its own');
  const email = buyerEmail(testInfo, 'connect-desktop');
  await page.goto('/get');
  await payOnGetPage(page, email);
  await paidUntil(page);
  await expect(page.getByText('Откройте сайт на iPhone, чтобы подключить его')).toBeVisible();
  await page.goto('/get/iphone');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Откройте сайт на iPhone, чтобы подключить его',
    }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Подключить iPhone', exact: true })).toHaveCount(0);

  // The same buyer on an iPhone: Safari's engine, without the computer's session.
  const { defaultBrowserType: _, ...iphone } = devices['iPhone 15'];
  const webkit = await playwright.webkit.launch();
  const phone = await webkit.newContext({ ...iphone, baseURL: SITE });
  const ios = await playwright.request.newContext();
  try {
    const mobile = await phone.newPage();
    await mobile.goto('/get/iphone');
    await expect(mobile).toHaveURL(/\/signin\?next=(%2F|\/)get(%2F|\/)iphone$/);
    await mobile.getByRole('button', { name: 'Войти по коду из письма' }).click();
    await mobile.getByLabel('Почта', { exact: true }).fill(email);
    await mobile.getByRole('button', { name: 'Получить код' }).click();
    await mobile.getByLabel('Код из письма').fill(await loginCode(email));
    await mobile.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(mobile).toHaveURL(/\/get\/iphone$/);

    await connectIphone(mobile, ios);
    await windowFollowsDevice(mobile);
    // «Мой доступ» shows the connected iPhone. The computer's guest session ended when the code
    // confirmed the email on the iPhone (Н1: claiming a guest purchase signs out its sessions).
    await mobile.goto('/access');
    await expect(mobile.getByText(/ · Готов$/)).toBeVisible();
  } finally {
    await ios.dispose();
    await phone.close();
    await webkit.close();
  }
});
