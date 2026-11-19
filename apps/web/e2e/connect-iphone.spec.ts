import {
  type APIRequest,
  type APIRequestContext,
  devices,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { e2eKitUdid } from '../playwright.config';
import { deviceAnswer, readProfile } from './fixtures/ios';
import { buyAsGuest, buyerEmail, loginCode, paidUntil, payOnGetPage } from './fixtures/purchase';
import { testDb, uploadSupplierKit } from './fixtures/staff';

// Н2: connecting an iPhone. iOS is played by the test: it takes the file the page downloads and
// posts a signed answer (test device under the e2e test root, see fixtures/ios.ts) to the URL in
// the file, without the site's cookies, as the iOS profile service does. The iPhone's UDID is one
// the fake supplier kit lists (playwright.config.ts), so the owner can then upload its files (Н3).

const SITE = 'http://localhost:3100';
const APP = 'Тестовое приложение 1';

/** A retry binds the same UDID again: the previous attempt's device goes first. */
async function freeUdid(udid: string): Promise<void> {
  const db = testDb();
  try {
    await db.device.deleteMany({ where: { udid } });
  } finally {
    await db.$disconnect();
  }
}

/** On `/get/iphone`: «Подключить iPhone» → file → iOS answers → «Готово, iPhone подключён». */
async function connectIphone(page: Page, ios: APIRequestContext, udid: string): Promise<void> {
  await freeUdid(udid);
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
    UDID: udid,
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

/**
 * The app window and `/get/iphone` follow the device: «Готовим ваш iPhone…» until the owner uploads
 * the supplier files, then «Скоро…» (installs: Н4); once the files end (the worker found them
 * revoked), «Обновляем доступ…».
 */
async function windowFollowsDevice(
  page: Page,
  playwright: { request: APIRequest },
  udid: string,
): Promise<void> {
  const button = (name: string) =>
    page.getByRole('dialog', { name: APP }).getByRole('button', { name });
  await page.goto('/?app=testovoe-prilozhenie-1');
  await expect(button('Готовим ваш iPhone, обычно до 24 часов')).toBeDisabled();

  await uploadSupplierKit(playwright, udid);
  await page.reload();
  await expect(button('Скоро можно будет установить')).toBeDisabled();
  await page.goto('/get/iphone');
  await expect(page.getByRole('heading', { level: 1, name: 'iPhone готов' })).toBeVisible();

  // What the worker does when Apple says the certificate is revoked (apps/worker certificates:check).
  const db = testDb();
  try {
    const device = await db.device.findUniqueOrThrow({ where: { udid } });
    await db.deviceCertificate.updateMany({
      where: { deviceId: device.id, status: 'active' },
      data: { status: 'revoked', endedAt: new Date() },
    });
    await db.device.update({ where: { id: device.id }, data: { status: 'processing' } });
  } finally {
    await db.$disconnect();
  }
  await page.reload();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Обновляем доступ, обычно до 24 часов' }),
  ).toBeVisible();
  await page.goto('/?app=testovoe-prilozhenie-1');
  await expect(button('Обновляем доступ, обычно до 24 часов')).toBeDisabled();
}

test('iPhone: pay → connect in Safari → «Готово, iPhone подключён» → window follows the device', async ({
  page,
  isMobile,
  playwright,
}, testInfo) => {
  test.skip(!isMobile, 'connecting happens on the iPhone itself');
  const email = buyerEmail(testInfo, 'connect');
  const udid = e2eKitUdid('connect', testInfo.project.name);
  await buyAsGuest(page, email);
  await page.getByRole('link', { name: 'Дальше: подключить iPhone' }).click();
  await expect(page).toHaveURL(/\/get\/iphone$/);

  const ios = await playwright.request.newContext();
  try {
    await connectIphone(page, ios, udid);
  } finally {
    await ios.dispose();
  }
  await windowFollowsDevice(page, playwright, udid);
});

test('computer pays → «Откройте сайт на iPhone» → iPhone signs in by code and connects', async ({
  page,
  isMobile,
  playwright,
}, testInfo) => {
  test.skip(isMobile, 'a computer pays here; the iPhone is a WebKit browser of its own');
  const email = buyerEmail(testInfo, 'connect-desktop');
  const udid = e2eKitUdid('connect', testInfo.project.name);
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

    await connectIphone(mobile, ios, udid);
    await windowFollowsDevice(mobile, playwright, udid);
    // «Мой доступ» shows the connected iPhone. The computer's guest session ended when the code
    // confirmed the email on the iPhone (Н1: claiming a guest purchase signs out its sessions).
    await mobile.goto('/access');
    await expect(mobile.getByText(/ · Обновляем доступ, обычно до 24 часов$/)).toBeVisible();
  } finally {
    await ios.dispose();
    await phone.close();
    await webkit.close();
  }
});
