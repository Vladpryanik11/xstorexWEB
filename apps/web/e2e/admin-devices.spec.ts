import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { e2eKitUdid } from '../playwright.config';
import { adminSession, supplierKit, testDb } from './fixtures/staff';

// Н3: the owner copies the UDID, gets files from the supplier and uploads them on the device page.
// The files are a fake supplier kit made by the Playwright config for both projects' UDIDs.

/** A buyer with live access and a connected iPhone that has no files yet. */
async function waitingBuyer(udid: string): Promise<string> {
  const client = testDb();
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
  const udid = e2eKitUdid('admin', info.project.name);
  const email = await waitingBuyer(udid);
  await adminSession(page.context());
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
  const kit = supplierKit();
  const upload = page.getByRole('button', { name: 'Загрузить', exact: true });
  await expect(upload).toBeDisabled();
  await page.getByLabel('Файл .p12').setInputFiles(kit.p12);
  await page.getByLabel('Пароль').fill(kit.password);
  await page.getByLabel('Файл .mobileprovision').setInputFiles(kit.profile);
  await upload.click();
  await expect(page.getByText('Сертификат загружен, покупателю отправлено письмо')).toBeVisible();
  await expect(page.getByText('Готов', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'TEAM123456' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.goto('/admin/devices');
  await expect(page.getByRole('row').filter({ hasText: email })).toHaveCount(0);
});
