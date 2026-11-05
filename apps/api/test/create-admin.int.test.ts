import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '@xstore/db';
import { resetDatabase } from '@xstore/db/testing';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { verifyPassword } from '../src/auth/password.js';
import { currentTotp, verifyTotp } from '../src/auth/totp.js';
import { upsertAdmin } from '../src/cli/admin-account.js';

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (!process.env.DATABASE_URL_TEST && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
// biome-ignore lint/style/noNonNullAssertion: checked by the env file or CI
const url = process.env.DATABASE_URL_TEST!;
const db = createPrismaClient(url);

beforeEach(() => resetDatabase(url));
afterAll(() => db.$disconnect());

it('creates an admin with a working password and TOTP secret', async () => {
  const result = await upsertAdmin(db, ' Admin@Xstorex.ru ', 'long enough password');
  expect(result.created).toBe(true);
  expect(result.otpauthUri).toMatch(/^otpauth:\/\/totp\/Xstore:admin%40xstorex\.ru\?/);
  const user = await db.user.findUniqueOrThrow({ where: { email: 'admin@xstorex.ru' } });
  expect(user.role).toBe('admin');
  // biome-ignore lint/style/noNonNullAssertion: set by upsertAdmin
  expect(await verifyPassword(user.passwordHash!, 'long enough password')).toBe(true);
  // biome-ignore lint/style/noNonNullAssertion: set by upsertAdmin
  expect(verifyTotp(user.totpSecret!, currentTotp(result.secret), new Date())).not.toBeNull();
  expect(await db.auditLog.count({ where: { action: 'admin.create', entityId: user.id } })).toBe(1);
});

it('resets an existing user, unblocks it and revokes its sessions', async () => {
  const user = await db.user.create({ data: { email: 'admin@xstorex.ru', blockedAt: new Date() } });
  await db.session.create({
    data: {
      id: 'x'.repeat(64),
      userId: user.id,
      kind: 'staff',
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  const result = await upsertAdmin(db, 'admin@xstorex.ru', 'another long password');
  expect(result.created).toBe(false);
  const saved = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(saved).toMatchObject({ role: 'admin', blockedAt: null });
  expect(await db.session.count()).toBe(0);
});

it('refuses a short password', async () => {
  await expect(upsertAdmin(db, 'admin@xstorex.ru', 'short')).rejects.toThrow(/не короче 12/);
  expect(await db.user.count()).toBe(0);
});
