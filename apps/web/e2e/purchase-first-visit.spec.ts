import { expect, test } from '@playwright/test';
import {
  accessUntil,
  buyerEmail,
  paidUntil,
  payOnGetPage,
  termEndingFrom,
  waitForLetter,
} from './fixtures/purchase';

// Н1: a first visit pays for the whole catalog through the fake provider (seed:e2e plan `month`).

test('first visit: app window → /get → email → pay on fake page → access active → set password', async ({
  page,
  isMobile,
}, testInfo) => {
  const email = buyerEmail(testInfo, 'first');
  await page.goto('/');
  await page
    .getByRole('button', { name: /^Тестовое приложение 1(?!\d)/ })
    .first()
    .click();
  const sheet = page.getByRole('dialog', { name: 'Тестовое приложение 1' });
  await sheet.getByRole('link', { name: isMobile ? 'Установить' : 'Оформить доступ' }).click();

  await expect(page).toHaveURL(/\/get\?app=testovoe-prilozhenie-1$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Доступ ко всему каталогу' }),
  ).toBeVisible();
  await expect(page.getByText('Вы выбрали')).toBeVisible();
  await expect(page.getByText('Тестовое приложение 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Подписка начнётся сразу после оплаты')).toBeVisible();
  // Nothing to press until the email and the consent are there.
  await expect(page.getByRole('button', { name: /^Оплатить / })).toBeDisabled();

  const before = Date.now();
  await payOnGetPage(page, email);
  const until = await paidUntil(page);
  await expect(page.getByTestId('wizard-status')).toHaveText(termEndingFrom(before));
  await expect(page.getByText('Оплата прошла', { exact: true })).toBeVisible();

  // The letter carries the same date, and no link that opens access without signing in.
  const letter = await waitForLetter(email, `Оплата прошла, доступ до ${until}`);
  expect(letter.text).not.toMatch(/token|session|code=/i);

  // «Придумайте пароль» right after payment.
  await page.getByLabel('Пароль', { exact: true }).fill('e2e-buyer-password');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Пароль сохранён. Входите по почте и паролю.')).toBeVisible();

  // Back to the app: `/app/<slug>` opens its window over the home page.
  await page.getByRole('link', { name: 'Вернуться к приложению' }).click();
  await expect(page).toHaveURL(/\/\?app=testovoe-prilozhenie-1$/);
  await expect(page.getByRole('dialog', { name: 'Тестовое приложение 1' })).toBeVisible();

  // A subscriber never sees the payment form again: without a device /get leads to step 2.
  await page.goto('/get');
  await expect(page).toHaveURL(/\/get\/iphone$/);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: isMobile ? 'Подключить iPhone' : 'Откройте сайт на iPhone, чтобы подключить его',
    }),
  ).toBeVisible();
  await page.goto('/access');
  expect(await accessUntil(page)).toBe(until);
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Пароль' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('desktop: pay from computer, access page works', async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, 'a computer-only scenario');
  const email = buyerEmail(testInfo, 'desktop');
  await page.goto('/');
  await page
    .getByRole('button', { name: /^Тестовое приложение 2(?!\d)/ })
    .first()
    .click();
  await page
    .getByRole('dialog', { name: 'Тестовое приложение 2' })
    .getByRole('link', { name: 'Оформить доступ' })
    .click();

  const before = Date.now();
  await payOnGetPage(page, email);
  const until = await paidUntil(page);
  await expect(page.getByTestId('wizard-status')).toHaveText(termEndingFrom(before));
  // Connecting happens on the iPhone itself: a computer gets the notice instead (no QR code).
  await expect(page.getByText('Откройте сайт на iPhone, чтобы подключить его')).toBeVisible();
  await expect(page.getByRole('link', { name: /подключить iPhone/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Пропустить' }).click();

  await page.goto('/access');
  await expect(page.getByRole('heading', { level: 1, name: 'Мой доступ' })).toBeVisible();
  expect(await accessUntil(page)).toBe(until);
  const term = page.getByRole('region', { name: 'Срок доступа' });
  await expect(term.getByText('Устройство ещё не подключено')).toBeVisible();
  await expect(term.getByRole('link', { name: 'Продлить' })).toHaveAttribute(
    'href',
    '/get?renew=1',
  );
  // No password yet: «Мой доступ» keeps offering one.
  await expect(
    page.getByRole('region', { name: 'Пароль' }).getByRole('heading', { name: 'Задать пароль' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // «Выйти» leaves a guest: «Мой доступ» asks to sign in.
  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/access');
  await expect(page).toHaveURL(/\/signin\?next=%2Faccess$|\/signin\?next=\/access$/);
});
