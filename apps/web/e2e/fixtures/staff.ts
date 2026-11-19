import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { APIRequest, BrowserContext } from '@playwright/test';
import { createPrismaClient, type PrismaClient } from '@xstore/db';
import { e2eKitDir } from '../../playwright.config';

const SITE = 'http://localhost:3100';

// Only for isolated, synthetic E2E staff accounts; password: e2e-password.
export const E2E_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$AsSK8euTtlecLMD2bxNEzw$LaK/UXTBU+X1Nfg7hjhdcvGilG0KIBy89B8OYk+L35o';

/** A client of the e2e test database; disconnect it when done. */
export function testDb(): PrismaClient {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  return createPrismaClient(url);
}

/** A fresh administrator's staff session token (no TOTP round trip). */
async function adminToken(): Promise<string> {
  const db = testDb();
  const token = randomBytes(32).toString('base64url');
  try {
    const user = await db.user.create({ data: { role: 'admin' } });
    await db.session.create({
      data: {
        id: createHash('sha256').update(token).digest('hex'),
        userId: user.id,
        kind: 'staff',
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
  } finally {
    await db.$disconnect();
  }
  return token;
}

/** Signs `context` in as a fresh administrator. */
export async function adminSession(context: BrowserContext): Promise<void> {
  const token = await adminToken();
  await context.addCookies([{ name: 'xs_session', value: token, url: SITE }]);
}

/**
 * The owner uploads the supplier kit for the device with `udid` through the admin API, from a
 * context of its own (the buyer's cookies stay untouched).
 */
export async function uploadSupplierKit(playwright: { request: APIRequest }, udid: string) {
  const db = testDb();
  let deviceId: string;
  try {
    deviceId = (await db.device.findUniqueOrThrow({ where: { udid }, select: { id: true } })).id;
  } finally {
    await db.$disconnect();
  }
  const admin = await playwright.request.newContext({
    baseURL: SITE,
    extraHTTPHeaders: { Cookie: `xs_session=${await adminToken()}`, Origin: SITE },
  });
  try {
    const kit = supplierKit();
    const res = await admin.post(`/api/v1/admin/devices/${deviceId}/certificate`, {
      data: {
        p12: readFileSync(kit.p12).toString('base64'),
        password: kit.password,
        profile: readFileSync(kit.profile).toString('base64'),
      },
    });
    if (res.status() !== 200 && res.status() !== 201) {
      throw new Error(`certificate upload failed: ${res.status()} ${await res.text()}`);
    }
  } finally {
    await admin.dispose();
  }
}

/** The fake supplier files made by the Playwright config (`E2E_KIT_UDIDS`). */
export function supplierKit(): { p12: string; profile: string; password: string } {
  const dir = e2eKitDir();
  return {
    p12: join(dir, 'kit.p12'),
    profile: join(dir, 'kit.mobileprovision'),
    password: readFileSync(join(dir, 'password.txt'), 'utf8'),
  };
}
