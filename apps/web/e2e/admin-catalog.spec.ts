import { createHash, createHmac, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { createPrismaClient } from '@xstore/db';
import { E2E_PASSWORD_HASH } from './fixtures/staff';

function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  return url;
}

// A separate administrator per test avoids TOTP replay/rate-limit interference across projects.
async function signIn(page: Page) {
  const db = createPrismaClient(testDatabaseUrl());
  const email = `e2e-${randomBytes(8).toString('hex')}@xstorex.ru`;
  try {
    await db.user.create({
      data: {
        email,
        role: 'admin',
        passwordHash: E2E_PASSWORD_HASH,
        totpSecret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
      },
    });
  } finally {
    await db.$disconnect();
  }
  await page.goto('/admin/apps');
  await page.getByLabel('Почта').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('e2e-password');
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', '12345678901234567890').update(counter).digest();
  const offset = digest.readUInt8(19) & 15;
  const code = String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
  await page.getByLabel('Код из приложения').fill(code);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/apps$/);
}

test('guests are redirected to the admin login', async ({ page }) => {
  await page.goto('/admin/apps');
  await expect(page).toHaveURL(/\/admin\/login\?next=/);
  await expect(page.getByLabel('Код из приложения')).toBeVisible();
});

test('admin signs in, uploads an IPA and publishes the app', async ({ page }, info) => {
  await signIn(page);
  const name = `Каталог ${info.project.name}`;
  await page.goto('/admin/apps/upload');
  await page
    .locator('input[type=file]')
    .setInputFiles(fileURLToPath(new URL(`./fixtures/${info.project.name}.ipa`, import.meta.url)));
  await page.getByRole('link', { name: 'Открыть приложение' }).click({ timeout: 60000 });
  await page.getByLabel('Основание для распространения').fill('Собственное тестовое приложение');
  await page
    .getByRole('combobox', { name: 'Категория', exact: true })
    .selectOption({ label: 'Утилиты' });
  await page.getByRole('button', { name: 'Сохранить карточку' }).click();
  await expect(page.getByRole('status')).toContainText('Сохранено');
  await page.getByRole('button', { name: 'Опубликовать версию' }).click();
  await page.getByRole('button', { name: 'Опубликовать приложение' }).click();
  await expect(page.getByText('Статус: Опубликовано')).toBeVisible();
  const href = await page.getByRole('link', { name: 'Открыть на сайте' }).getAttribute('href');
  if (!href) throw new Error('Missing public app link');
  await page.goto(href);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
});

test('support can read jobs but cannot open the catalog editor', async ({ page }) => {
  const db = createPrismaClient(testDatabaseUrl());
  const token = randomBytes(32).toString('base64url');
  try {
    const user = await db.user.create({ data: { role: 'support' } });
    await db.session.create({
      data: {
        id: createHash('sha256').update(token).digest('hex'),
        userId: user.id,
        kind: 'staff',
        expiresAt: new Date(Date.now() + 600000),
      },
    });
  } finally {
    await db.$disconnect();
  }
  await page
    .context()
    .addCookies([{ name: 'xs_session', value: token, url: 'http://localhost:3100' }]);
  await page.goto('/admin/jobs');
  await expect(page.getByRole('heading', { level: 1, name: 'Ошибки заданий' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Повторить' })).toHaveCount(0);
  await page.goto('/admin/apps');
  await expect(page).toHaveURL(/\/admin\/jobs$/);
});

test('admin manages categories and collection contents', async ({ page }, info) => {
  const db = createPrismaClient(testDatabaseUrl());
  const token = randomBytes(32).toString('base64url');
  try {
    const user = await db.user.create({ data: { role: 'admin' } });
    await db.session.create({
      data: {
        id: createHash('sha256').update(token).digest('hex'),
        userId: user.id,
        kind: 'staff',
        expiresAt: new Date(Date.now() + 600000),
      },
    });
  } finally {
    await db.$disconnect();
  }
  await page
    .context()
    .addCookies([{ name: 'xs_session', value: token, url: 'http://localhost:3100' }]);
  const name = `Проверка ${info.project.name}`;
  await page.goto('/admin/categories');
  const categoryForm = page.getByRole('heading', { name: 'Добавить категорию' }).locator('..');
  await categoryForm.getByLabel('Название категории').fill(name);
  await categoryForm.getByRole('button', { name: 'Добавить категорию' }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const category = page.getByRole('heading', { name, exact: true }).locator('..');
  await category.getByLabel('Название категории').fill(`${name} обновлено`);
  await category.getByRole('button', { name: 'Сохранить категорию' }).click();
  await expect(page.getByRole('heading', { name: `${name} обновлено`, exact: true })).toBeVisible();
  await page.goto('/admin/collections');
  await page.getByLabel('Название подборки').fill(name);
  await page.getByLabel('Показывать на главной').uncheck();
  await page.getByRole('button', { name: 'Добавить подборку' }).click();
  await page.getByRole('link', { name, exact: true }).click();
  await page.getByLabel('Найти приложение').fill('Тестовое приложение');
  await page.getByRole('button', { name: 'Найти', exact: true }).click();
  const found = page.getByRole('list', { name: 'Найденные приложения' });
  await found.getByRole('button', { name: 'Добавить в подборку' }).first().click();
  await found.getByRole('button', { name: 'Добавить в подборку' }).nth(1).click();
  const items = page.getByRole('list', { name: 'Приложения в подборке' });
  await expect(items.locator('li')).toHaveCount(2);
  const newFirst = await items.locator('li').nth(1).locator('span').textContent();
  await items.locator('li').nth(1).getByRole('button', { name: /выше/ }).click();
  await items.locator('li').first().getByLabel('Закрепить').check();
  await page.getByRole('button', { name: 'Сохранить состав' }).click();
  await expect(page.getByRole('status')).toHaveText('Сохранено');
  await page.reload();
  await expect(items.locator('li').first().locator('span')).toHaveText(newFirst ?? '');
  await expect(items.locator('li').first().getByLabel('Закрепить')).toBeChecked();
});

test('an admin role with a user session cannot enter staff pages', async ({ page }) => {
  const db = createPrismaClient(testDatabaseUrl());
  const token = randomBytes(32).toString('base64url');
  try {
    const user = await db.user.create({ data: { role: 'admin' } });
    await db.session.create({
      data: {
        id: createHash('sha256').update(token).digest('hex'),
        userId: user.id,
        kind: 'user',
        expiresAt: new Date(Date.now() + 600000),
      },
    });
  } finally {
    await db.$disconnect();
  }
  await page
    .context()
    .addCookies([{ name: 'xs_session', value: token, url: 'http://localhost:3100' }]);
  await page.goto('/admin/apps');
  await expect(page).toHaveURL(/\/admin\/login\?next=/);
});
