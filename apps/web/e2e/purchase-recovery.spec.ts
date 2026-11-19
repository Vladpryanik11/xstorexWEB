import { expect, test } from '@playwright/test';
import {
  accessUntil,
  buyAsGuest,
  buyerEmail,
  daysBetween,
  loginCode,
  paidUntil,
  payOnGetPage,
} from './fixtures/purchase';

// Н1: renewal and getting access back on a browser without the session cookie.

test('renewal adds 30 days after current end', async ({ page, context }, testInfo) => {
  const email = buyerEmail(testInfo, 'renew');
  const password = 'e2e-renew-password';
  const until = await buyAsGuest(page, email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Пароль сохранён. Входите по почте и паролю.')).toBeVisible();

  // Sign in again by email and password.
  await context.clearCookies();
  await page.goto('/access');
  await expect(page).toHaveURL(/\/signin\?next=/);
  await page.getByLabel('Почта', { exact: true }).fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/access$/);
  expect(await accessUntil(page)).toBe(until);

  await page.getByRole('link', { name: 'Продлить' }).click();
  await expect(page).toHaveURL(/\/get\?renew=1$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Продление доступа' })).toBeVisible();
  const promised = page.getByText(/^Доступ продлится до /);
  await expect(promised).toBeVisible();
  const promisedDate = ((await promised.textContent()) ?? '').replace('Доступ продлится до ', '');
  expect(daysBetween(until, promisedDate)).toBe(30);

  // The address from the first payment is already filled in.
  await payOnGetPage(page);
  const renewed = await paidUntil(page);
  expect(renewed).toBe(promisedDate);

  await page.goto('/access');
  expect(await accessUntil(page)).toBe(renewed);
  expect(daysBetween(until, renewed)).toBe(30);
});

test('lost cookie: clear cookies → signin by code from Mailpit → same date in Мой доступ', async ({
  page,
  context,
}, testInfo) => {
  const email = buyerEmail(testInfo, 'lost');
  const until = await buyAsGuest(page, email);
  // The buyer leaves without a password: only the code from the email gets them back in.
  await page.getByRole('button', { name: 'Пропустить' }).click();

  await context.clearCookies();
  await page.goto('/access');
  await expect(page).toHaveURL(/\/signin\?next=/);
  await expect(page.getByRole('heading', { level: 1, name: 'Вход' })).toBeVisible();

  await page.getByRole('button', { name: 'Войти по коду из письма' }).click();
  await page.getByLabel('Почта', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Получить код' }).click();
  await expect(page.getByText(`Отправили код на ${email}. Он действует 10 минут.`)).toBeVisible();

  const code = await loginCode(email);
  await page.getByLabel('Код из письма').fill(code);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();

  await expect(page).toHaveURL(/\/access$/);
  expect(await accessUntil(page)).toBe(until);
  await expect(page.getByText(email)).toBeVisible();
});
