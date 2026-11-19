import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { createPrismaClient } from '@xstore/db';
import { E2E_KIT_UDIDS, e2eKitDir } from '../playwright.config';

// Н3: the owner copies the UDID, gets files from the supplier and uploads them on the device page.
// The files are a fake supplier kit made by the Playwright config for both projects' UDIDs.

function db() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  return createPrismaClient(url);
}

async function adminSession(page: Page): Promise<void> {
  const client = db();
  const token = randomBytes(32).toString('base64url');
  try {
    const user = await client.user.create({ data: { role: 'admin' } });
    await client.session.create({
      data: {
        id: createHash('sha256').update(token).digest('hex'),
        userId: user.id,
        kind: 'staff',
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
  } finally {
    await client.$disconnect();
  }
  await page
    .context()
    .addCookies([{ name: 'xs_session', value: token, url: 'http://localhost:3100' }]);
}

/** A buyer with live access and a connected iPhone that has no files yet. */
async function waitingBuyer(udid: string): Promise<string> {
  const client = db();
  const email = `e2e-dev-${randomBytes(6).toString('hex')}@xstorex.test`;
  try {
    await client.device.deleteMany({ where: { udid } });
    const now = Date.now();
    const user = await client.user.create({ data: { email } });
    const device = await client.device.create({
      data: {
        userId: user.id,
        udid,
        product: 'iPhone16,1',
        iosVersion: '22B83',
        name: 'iPhone 15 Pro',
        status: 'pending',
      },
    });
    await client.subscription.create({
      data: {
        userId: user.id,
        deviceId: device.id,
        assignedAt: new Date(now - 3_600_000),
        entitlements: {
          create: {
            planCode: 'month',
            durationDays: 30,
            startsAt: new Date(now - 3_600_000),
            expiresAt: new Date(now + 29 * 86_400_000),
          },
        },
      },
    });
  } finally {
    await client.$disconnect();
  }
  return email;
}

test('admin copies the UDID, uploads the supplier files, the device is ready', async ({
  page,
}, info) => {
  const udid = E2E_KIT_UDIDS[info.project.name as keyof typeof E2E_KIT_UDIDS];
  const email = await waitingBuyer(udid);
  await adminSession(page);
  await page.goto('/admin/devices');
  await expect(page.getByRole('heading', { level: 1, name: 'Ждут сертификата' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: email });
  await expect(row).toContainText(udid);
  await expect(row).toContainText('Новое');
  await expect(page.getByRole('navigation', { name: 'Администрирование' })).toContainText(
    /Ждут сертификата\s*\d+/,
  );

  await row.getByRole('link', { name: 'Загрузить сертификат' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'iPhone 15 Pro' })).toBeVisible();
  const kit = e2eKitDir();
  const upload = page.getByRole('button', { name: 'Загрузить', exact: true });
  await expect(upload).toBeDisabled();
  await page.getByLabel('Файл .p12').setInputFiles(join(kit, 'kit.p12'));
  await page.getByLabel('Пароль').fill(readFileSync(join(kit, 'password.txt'), 'utf8'));
  await page.getByLabel('Файл .mobileprovision').setInputFiles(join(kit, 'kit.mobileprovision'));
  await upload.click();
  await expect(page.getByText('Сертификат загружен, покупателю отправлено письмо')).toBeVisible();
  await expect(page.getByText('Готов', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'TEAM123456' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.goto('/admin/devices');
  await expect(page.getByRole('row').filter({ hasText: email })).toHaveCount(0);
});
