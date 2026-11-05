import { afterAll, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import { createPrismaClient, readSetting } from '../src/index.js';
import { resetDatabase } from '../src/testing.js';

// biome-ignore lint/style/noNonNullAssertion: guaranteed by global-setup
const url = process.env.DATABASE_URL_TEST!;
const db = createPrismaClient(url);

beforeEach(() => resetDatabase(url));
afterAll(() => db.$disconnect());

it('returns the stored value when it matches the schema', async () => {
  await db.setting.create({ data: { key: 'test.limit', value: 7 } });
  expect(await readSetting(db, 'test.limit', z.number().int(), 3)).toBe(7);
});

it('falls back when the row is missing', async () => {
  expect(await readSetting(db, 'test.missing', z.number(), 3)).toBe(3);
});

it('falls back when the stored value fails the schema', async () => {
  await db.setting.create({ data: { key: 'test.bad', value: 'seven' } });
  expect(await readSetting(db, 'test.bad', z.number(), 3)).toBe(3);
});

it('resetDatabase empties every table but keeps migrations', async () => {
  await db.user.create({ data: { email: 'a@example.com' } });
  await db.auditLog.create({ data: { action: 'x', entity: 'y' } });
  await resetDatabase(url);
  expect(await db.user.count()).toBe(0);
  expect(await db.auditLog.count()).toBe(0);
  const rows = await db.$queryRawUnsafe<unknown[]>('SELECT 1 FROM "_prisma_migrations" LIMIT 1');
  expect(rows.length).toBe(1);
});
