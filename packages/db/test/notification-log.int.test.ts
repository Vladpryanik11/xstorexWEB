import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../src/index.js';

// biome-ignore lint/style/noNonNullAssertion: guaranteed by global-setup
const db = createPrismaClient(process.env.DATABASE_URL_TEST!);
afterAll(() => db.$disconnect());

const row = (dedupeKey: string | null) => ({
  template: 'payment_paid',
  to: 'a@b.ru',
  subject: 'Оплата прошла',
  status: 'sending',
  dedupeKey,
});

describe('NotificationLog', () => {
  it('dedupeKey is unique', async () => {
    const key = `payment_paid:${randomUUID()}`;
    await db.notificationLog.create({ data: row(key) });
    await expect(db.notificationLog.create({ data: row(key) })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('rows without dedupeKey do not conflict', async () => {
    await db.notificationLog.create({ data: row(null) });
    await db.notificationLog.create({ data: row(null) });
  });
});
