import { afterAll, beforeEach, expect, it } from 'vitest';
import { createPrismaClient } from '../src/index.js';
import { resetDatabase } from '../src/testing.js';

// biome-ignore lint/style/noNonNullAssertion: guaranteed by global setup
const url = process.env.DATABASE_URL_TEST!;
const db = createPrismaClient(url);
const udid = '00008110-001A2B3C4D5E6F70';

beforeEach(() => resetDatabase(url));
afterAll(() => db.$disconnect());

async function seedDevice() {
  const user = await db.user.create({ data: {} });
  const device = await db.device.create({
    data: {
      userId: user.id,
      udid,
      product: 'iPhone15,2',
      iosVersion: '22B83',
      name: 'iPhone 14 Pro',
    },
  });
  return { user, device };
}

it('creates a new device with its owner and safe defaults', async () => {
  const { user, device } = await seedDevice();
  expect(device).toMatchObject({
    userId: user.id,
    status: 'new',
    registeredAt: null,
    appleAccountId: null,
  });
  expect(device.createdAt).toBeInstanceOf(Date);
  expect(device).not.toHaveProperty('serial');
});

it('a UDID belongs to one device only', async () => {
  const { device } = await seedDevice();
  const other = await db.user.create({ data: {} });
  await expect(
    db.device.create({
      data: {
        userId: other.id,
        udid,
        product: 'iPhone15,2',
        iosVersion: '22B83',
        name: 'Другой',
      },
    }),
  ).rejects.toMatchObject({ code: 'P2002' });
  expect((await db.device.findUniqueOrThrow({ where: { id: device.id } })).userId).toBe(
    device.userId,
  );
});

it('persists pending enrollment and its optional owner and device', async () => {
  const { user, device } = await seedDevice();
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const enrollment = await db.enrollmentSession.create({
    data: {
      nonce: 'single-use-nonce',
      userId: user.id,
      deviceId: device.id,
      next: '/devices',
      expiresAt,
    },
  });
  expect(enrollment).toMatchObject({
    status: 'pending',
    userId: user.id,
    deviceId: device.id,
    next: '/devices',
    expiresAt,
  });
  await expect(
    db.enrollmentSession.create({ data: { nonce: enrollment.nonce, expiresAt } }),
  ).rejects.toMatchObject({ code: 'P2002' });
});

it('removing a device clears the optional session reference', async () => {
  const { user, device } = await seedDevice();
  await db.session.create({
    data: {
      id: 'a'.repeat(64),
      userId: user.id,
      deviceId: device.id,
      kind: 'user',
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  await db.device.delete({ where: { id: device.id } });
  expect(
    (await db.session.findUniqueOrThrow({ where: { id: 'a'.repeat(64) } })).deviceId,
  ).toBeNull();
});

it('installation history requires an existing device', async () => {
  const app = await db.app.create({ data: { slug: 'test', name: 'Тест' } });
  await expect(
    db.installEvent.create({ data: { appId: app.id, deviceId: 'missing-device' } }),
  ).rejects.toMatchObject({ code: 'P2003' });
  const { device } = await seedDevice();
  const event = await db.installEvent.create({ data: { appId: app.id, deviceId: device.id } });
  expect(event.deviceId).toBe(device.id);
});
