import { expect, it } from 'vitest';
import { createPrismaClient } from '../src/index.js';

it('stores and reads a JSON setting', async () => {
  // biome-ignore lint/style/noNonNullAssertion: guaranteed by global-setup
  const db = createPrismaClient(process.env.DATABASE_URL_TEST!);
  await db.setting.upsert({
    where: { key: 'devices.lowSlotsThreshold' },
    create: { key: 'devices.lowSlotsThreshold', value: 10 },
    update: { value: 10 },
  });
  const row = await db.setting.findUniqueOrThrow({ where: { key: 'devices.lowSlotsThreshold' } });
  expect(row.value).toBe(10);
  expect(row.updatedAt).toBeInstanceOf(Date);
  await db.$disconnect();
});
