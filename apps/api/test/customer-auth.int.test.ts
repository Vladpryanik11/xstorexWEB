import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { createFakeProvider, fakeWebhookSignature } from '@xstore/billing';
import { createPrismaClient } from '@xstore/db';
import { resetDatabase } from '@xstore/db/testing';
import { mailpitMessages, waitForMail } from '@xstore/mail/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { loadConfig } from '../src/config/config.js';
import { checkoutBody, cookieExpiry, postCheckout, SITE, seedPlan } from './helpers/billing.js';
import { TEST_WEBHOOK_SECRET, testEnv } from './test-env.js';

// biome-ignore lint/style/noNonNullAssertion: checked by the env file or CI
const dbUrl = process.env.DATABASE_URL_TEST!;
// biome-ignore lint/style/noNonNullAssertion: checked by the env file or CI
const redisUrl = process.env.REDIS_URL_TEST!;

const db = createPrismaClient(dbUrl);
const redis = new Redis(redisUrl);
const fake = createFakeProvider(redis, { siteUrl: SITE, webhookSecret: TEST_WEBHOOK_SECRET });
const DAY_MS = 24 * 60 * 60 * 1000;
let app: INestApplication;

beforeAll(async () => {
  app = await createApp(loadConfig(testEnv({ SITE_URL: SITE })));
});

beforeEach(async () => {
  await resetDatabase(dbUrl);
  await redis.flushdb();
  await seedPlan(db);
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
  redis.disconnect();
});

/** A unique address per test: Mailpit is shared and never cleared. */
const rcpt = () => `auth-${randomUUID()}@example.ru`;
const agentOf = () => request.agent(app.getHttpServer());
type Agent = ReturnType<typeof agentOf>;

const post = (agent: Agent, path: string, body: object) =>
  agent.post(`/api/v1/auth/${path}`).set('Origin', SITE).send(body);

/** Guest checkout plus a paid webhook; returns the buyer's cookie agent and access end. */
async function buyAndPay(email: string, paidAt = new Date(Date.now() - 60_000)) {
  const agent = agentOf();
  const res = await postCheckout(agent, checkoutBody(randomUUID(), { email }));
  expect(res.status).toBe(200);
  const order = await db.order.findUniqueOrThrow({ where: { id: res.body.orderId } });
  const paymentId = order.providerPaymentId ?? '';
  await fake.setStatus(paymentId, 'paid', paidAt);
  const raw = Buffer.from(JSON.stringify({ paymentId, eventId: `ev-${order.id}` }));
  const hook = await request(app.getHttpServer())
    .post('/api/v1/billing/webhooks/fake')
    .set('content-type', 'application/json')
    .set('x-fake-signature', fakeWebhookSignature(TEST_WEBHOOK_SECRET, raw))
    .send(raw.toString('utf8'));
  expect(hook.status).toBe(204);
  const access = await agent.get('/api/v1/access');
  expect(access.body.state.kind).toBe('active');
  return { agent, order, until: access.body.state.until as string };
}

/** Requests a code and reads it from the newest letter (a payment letter may come first). */
async function mailedCode(email: string): Promise<string> {
  const before = (await mailpitMessages(email)).length;
  const res = await post(agentOf(), 'code/request', { email });
  expect(res.status).toBe(204);
  const letters = await waitForMail(email, before + 1);
  const mail = letters.filter((m) => m.subject === 'Код для входа').at(-1);
  const code = /Ваш код: (\d{6})/.exec(mail?.text ?? '')?.[1];
  expect(code).toBeDefined();
  return code ?? '';
}

async function loginByCode(email: string): Promise<Agent> {
  const code = await mailedCode(email);
  const agent = agentOf();
  const res = await post(agent, 'code/verify', { email, code });
  expect(res.status).toBe(204);
  return agent;
}

it('set password after payment then login with email and password', async () => {
  const email = rcpt();
  const { agent, until } = await buyAndPay(email);
  expect((await post(agent, 'password', { password: 'correct horse' })).status).toBe(204);
  expect((await agent.get('/api/v1/access')).body.hasPassword).toBe(true);

  const other = agentOf();
  const res = await post(other, 'login', {
    email: ` ${email.toUpperCase()} `,
    password: 'correct horse',
  });
  expect(res.status).toBe(204);
  const access = await other.get('/api/v1/access');
  expect(access.body.state).toMatchObject({ kind: 'active', until });
  // The new session follows paid access: at least its end + 7 days.
  expect(cookieExpiry(res)?.getTime()).toBeGreaterThanOrEqual(
    new Date(until).getTime() + 7 * DAY_MS - 1000,
  );
  const stored = await db.user.findFirstOrThrow({ where: { checkoutEmail: email } });
  expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
});

it('wrong password returns INVALID_CREDENTIALS', async () => {
  const email = rcpt();
  const { agent } = await buyAndPay(email);
  await post(agent, 'password', { password: 'correct horse' });

  const wrong = await post(agentOf(), 'login', { email, password: 'wrong horse' });
  expect(wrong.status).toBe(401);
  expect(wrong.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  expect(wrong.headers['set-cookie']).toBeUndefined();

  const unknown = await post(agentOf(), 'login', { email: rcpt(), password: 'correct horse' });
  expect(unknown.status).toBe(401);
  expect(unknown.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });

  // Five attempts per 15 minutes per IP: two failures above, three more, then the limit.
  for (let i = 0; i < 3; i += 1) await post(agentOf(), 'login', { email, password: 'nope-nope' });
  const limited = await post(agentOf(), 'login', { email, password: 'correct horse' });
  expect(limited.status).toBe(429);
  expect(limited.body.code).toBe('RATE_LIMITED');
});

it('code login restores paid access with same dates', async () => {
  const email = rcpt();
  const { order, until } = await buyAndPay(email);
  const before = await db.entitlement.findFirstOrThrow({ where: { orderId: order.id } });

  const agent = await loginByCode(email);
  const access = await agent.get('/api/v1/access');
  expect(access.body.state).toMatchObject({ kind: 'active', until });
  expect(access.body.email).toBe(email);
  const me = await agent.get('/api/v1/auth/me');
  expect(me.body.user).toMatchObject({ email, role: 'user' });

  const after = await db.entitlement.findFirstOrThrow({ where: { orderId: order.id } });
  expect(after).toEqual(before);
  // The code is stored only as a hash and works once.
  const rows = await db.emailCode.findMany({ where: { email } });
  expect(rows).toHaveLength(1);
  expect(rows[0]?.codeHash).toMatch(/^[0-9a-f]{64}$/);
  expect(rows[0]?.usedAt).not.toBeNull();
});

it('claim moves provisional purchases into verified account', async () => {
  const email = rcpt();
  const first = await buyAndPay(email, new Date(Date.now() - 2 * DAY_MS));
  const second = await buyAndPay(email);
  const subsBefore = await db.subscription.findMany({
    where: { orders: { some: { checkoutEmail: email } } },
    orderBy: { createdAt: 'asc' },
  });
  expect(subsBefore).toHaveLength(2);
  const rightsBefore = await db.entitlement.findMany({ orderBy: { startsAt: 'asc' } });

  const agent = await loginByCode(email);
  const verified = await db.user.findUniqueOrThrow({ where: { email } });
  expect(verified).toMatchObject({ isProvisional: false, role: 'user', blockedAt: null });

  const subsAfter = await db.subscription.findMany({ where: { userId: verified.id } });
  expect(subsAfter.map((s) => s.id).sort()).toEqual(subsBefore.map((s) => s.id).sort());
  const orders = await db.order.findMany({ where: { checkoutEmail: email } });
  expect(orders.map((o) => o.userId)).toEqual([verified.id, verified.id]);
  expect(await db.entitlement.findMany({ orderBy: { startsAt: 'asc' } })).toEqual(rightsBefore);

  const provisional = await db.user.findMany({ where: { checkoutEmail: email } });
  expect(provisional).toHaveLength(2);
  for (const p of provisional) expect(p.blockedAt).not.toBeNull();

  const access = await agent.get('/api/v1/access');
  const latest = [first.until, second.until].sort().at(-1);
  expect(access.body.state).toMatchObject({ kind: 'active', until: latest });

  // A second code login finds the same verified user and moves nothing more.
  await redis.flushdb();
  const again = await loginByCode(email);
  expect((await again.get('/api/v1/auth/me')).body.user.id).toBe(verified.id);
  expect(await db.user.count({ where: { email } })).toBe(1);
});

it('claim never touches staff or another verified account', async () => {
  const email = rcpt();
  const otherEmail = rcpt();
  const { order } = await buyAndPay(email);
  const other = await db.user.create({
    data: { email: otherEmail, role: 'user', checkoutEmail: email },
  });
  const otherSub = await db.subscription.create({ data: { userId: other.id } });
  // Shaped like a provisional buyer of this email, but staff.
  const staff = await db.user.create({
    data: { role: 'admin', checkoutEmail: email, isProvisional: true },
  });
  const staffSub = await db.subscription.create({ data: { userId: staff.id } });

  await loginByCode(email);
  const verified = await db.user.findUniqueOrThrow({ where: { email } });
  expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).userId).toBe(verified.id);
  expect(await db.subscription.findUniqueOrThrow({ where: { id: otherSub.id } })).toMatchObject({
    userId: other.id,
  });
  expect(await db.subscription.findUniqueOrThrow({ where: { id: staffSub.id } })).toMatchObject({
    userId: staff.id,
  });
  expect((await db.user.findUniqueOrThrow({ where: { id: other.id } })).blockedAt).toBeNull();
  expect((await db.user.findUniqueOrThrow({ where: { id: staff.id } })).blockedAt).toBeNull();
});

it('a staff email never gets a buyer session by code', async () => {
  const email = rcpt();
  await db.user.create({ data: { email, role: 'support', passwordHash: await hashPassword('x') } });
  const code = await mailedCode(email);
  const res = await post(agentOf(), 'code/verify', { email, code });
  expect(res.status).toBe(403);
  expect(res.headers['set-cookie']).toBeUndefined();
});

it('sixth wrong code attempt invalidates the code', async () => {
  // Five wrong attempts are tolerated: the right code still works after them.
  const tolerant = rcpt();
  const good = await mailedCode(tolerant);
  const wrongOf = (c: string) => String((Number(c) + 1) % 1_000_000).padStart(6, '0');
  for (let i = 0; i < 5; i += 1) {
    const res = await post(agentOf(), 'code/verify', { email: tolerant, code: wrongOf(good) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CODE_INVALID');
  }
  expect((await post(agentOf(), 'code/verify', { email: tolerant, code: good })).status).toBe(204);
  // Used once: a replay fails.
  const replay = await post(agentOf(), 'code/verify', { email: tolerant, code: good });
  expect(replay.body.code).toBe('CODE_INVALID');

  const email = rcpt();
  const code = await mailedCode(email);
  for (let i = 0; i < 6; i += 1) {
    await post(agentOf(), 'code/verify', { email, code: wrongOf(code) });
  }
  const res = await post(agentOf(), 'code/verify', { email, code });
  expect(res.status).toBe(400);
  expect(res.body.code).toBe('CODE_INVALID');
  expect(res.headers['set-cookie']).toBeUndefined();
});

it('an expired code is rejected', async () => {
  const email = rcpt();
  const code = await mailedCode(email);
  await db.emailCode.updateMany({
    where: { email },
    data: { expiresAt: new Date(Date.now() - 1) },
  });
  const res = await post(agentOf(), 'code/verify', { email, code });
  expect(res.body.code).toBe('CODE_INVALID');
});

it('code request for unknown email returns 204 and sends mail', async () => {
  const email = rcpt();
  const res = await post(agentOf(), 'code/request', { email: `  ${email.toUpperCase()}` });
  expect(res.status).toBe(204);
  const [mail] = await waitForMail(email);
  expect(mail?.subject).toBe('Код для входа');
  const code = /Ваш код: (\d{6})/.exec(mail?.text ?? '')?.[1] ?? '';
  const [row] = await db.emailCode.findMany({ where: { email } });
  expect(row?.codeHash).not.toContain(code);
  expect(row?.codeHash).not.toBe(createHash('sha256').update(code).digest('hex'));
  expect(row?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000);
  expect(row?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
  expect(JSON.stringify(await db.notificationLog.findMany({ where: { to: email } }))).not.toContain(
    code,
  );
  expect(await db.user.count({ where: { email } })).toBe(0);
});

it('code request waits 60 seconds and allows three per email', async () => {
  const email = rcpt();
  expect((await post(agentOf(), 'code/request', { email })).status).toBe(204);
  const soon = await post(agentOf(), 'code/request', { email });
  expect(soon.status).toBe(429);
  expect(soon.body.code).toBe('RATE_LIMITED');
  expect(Number(soon.headers['retry-after'])).toBeGreaterThan(0);

  for (let i = 0; i < 2; i += 1) {
    await redis.del(`code:cooldown:${email}`);
    expect((await post(agentOf(), 'code/request', { email })).status).toBe(204);
  }
  await redis.del(`code:cooldown:${email}`);
  expect((await post(agentOf(), 'code/request', { email })).status).toBe(429);
  // Only the newest code is live.
  const live = await db.emailCode.count({ where: { email, usedAt: null } });
  expect(live).toBe(1);
});

it('code request allows ten per IP in ten minutes', async () => {
  for (let i = 0; i < 10; i += 1) {
    expect((await post(agentOf(), 'code/request', { email: rcpt() })).status).toBe(204);
  }
  expect((await post(agentOf(), 'code/request', { email: rcpt() })).status).toBe(429);
});

it('old provisional session stops working after claim', async () => {
  const email = rcpt();
  const { agent } = await buyAndPay(email);
  expect((await agent.get('/api/v1/auth/me')).status).toBe(200);
  const provisional = await db.user.findFirstOrThrow({ where: { checkoutEmail: email } });

  await loginByCode(email);
  expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  expect((await agent.get('/api/v1/access')).body).toEqual({ state: { kind: 'none' } });
  expect(await db.session.count({ where: { userId: provisional.id } })).toBe(0);
  // Its password no longer signs in either: the account is closed.
  const login = await post(agentOf(), 'login', { email, password: 'whatever1' });
  expect(login.status).toBe(401);
});

it('password shorter than 8 returns WEAK_PASSWORD', async () => {
  const email = rcpt();
  const { agent } = await buyAndPay(email);
  const short = await post(agent, 'password', { password: '1234567' });
  expect(short.status).toBe(400);
  expect(short.body).toMatchObject({ code: 'WEAK_PASSWORD' });
  const long = await post(agent, 'password', { password: 'x'.repeat(129) });
  expect(long.body).toMatchObject({ code: 'WEAK_PASSWORD' });
  expect((await post(agentOf(), 'password', { password: 'long enough' })).status).toBe(401);
  expect((await db.user.findFirstOrThrow({ where: { checkoutEmail: email } })).passwordHash).toBe(
    null,
  );
});

it('password recovery is a code login followed by a new password', async () => {
  const email = rcpt();
  const agent = await loginByCode(email);
  expect((await post(agent, 'password', { password: 'first password' })).status).toBe(204);
  await redis.flushdb();
  const again = await loginByCode(email);
  expect((await post(again, 'password', { password: 'second password' })).status).toBe(204);
  expect((await post(agentOf(), 'login', { email, password: 'first password' })).status).toBe(401);
  expect((await post(agentOf(), 'login', { email, password: 'second password' })).status).toBe(204);
});
