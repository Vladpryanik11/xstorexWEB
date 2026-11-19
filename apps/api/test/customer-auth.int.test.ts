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
import { SessionService } from '../src/auth/session.service.js';
import { CheckoutService } from '../src/billing/checkout.service.js';
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

/** Marks a fake payment paid and delivers its webhook. */
async function payByWebhook(order: { id: string; providerPaymentId: string | null }, paidAt: Date) {
  const paymentId = order.providerPaymentId ?? '';
  await fake.setStatus(paymentId, 'paid', paidAt);
  const raw = Buffer.from(JSON.stringify({ paymentId, eventId: `ev-${order.id}` }));
  const hook = await request(app.getHttpServer())
    .post('/api/v1/billing/webhooks/fake')
    .set('content-type', 'application/json')
    .set('x-fake-signature', fakeWebhookSignature(TEST_WEBHOOK_SECRET, raw))
    .send(raw.toString('utf8'));
  expect(hook.status).toBe(204);
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

it('password login allows ten per email in 15 minutes, from any IP, known or not', async () => {
  const email = rcpt();
  const { agent } = await buyAndPay(email);
  await post(agent, 'password', { password: 'correct horse' });
  const unknown = rcpt();
  // A new address per attempt keeps the per-IP limit (five) out of the way.
  let ip = 0;
  const from = (body: object) =>
    agentOf()
      .post('/api/v1/auth/login')
      .set('Origin', SITE)
      .set('X-Forwarded-For', `10.0.0.${(ip += 1)}`)
      .send(body);

  for (let i = 0; i < 10; i += 1) {
    expect((await from({ email: email.toUpperCase(), password: 'nope-nope' })).status).toBe(401);
    expect((await from({ email: unknown, password: 'nope-nope' })).status).toBe(401);
  }
  const limited = await from({ email, password: 'correct horse' });
  expect(limited.status).toBe(429);
  expect(limited.body.code).toBe('RATE_LIMITED');
  expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  expect(limited.headers['set-cookie']).toBeUndefined();
  // An address nobody uses gets the same answer, so the limit does not tell whether it exists.
  const limitedUnknown = await from({ email: unknown, password: 'nope-nope' });
  expect(limitedUnknown.status).toBe(429);
  expect(limitedUnknown.body).toEqual(limited.body);
  // Other addresses are not affected.
  expect((await from({ email: rcpt(), password: 'nope-nope' })).status).toBe(401);
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

it('sixth code attempt is refused even when correct', async () => {
  // Five attempts in total: four wrong ones still leave the fifth for the right code.
  const tolerant = rcpt();
  const good = await mailedCode(tolerant);
  const wrongOf = (c: string) => String((Number(c) + 1) % 1_000_000).padStart(6, '0');
  for (let i = 0; i < 4; i += 1) {
    const res = await post(agentOf(), 'code/verify', { email: tolerant, code: wrongOf(good) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CODE_INVALID');
  }
  expect((await post(agentOf(), 'code/verify', { email: tolerant, code: good })).status).toBe(204);
  // Used once: a replay fails.
  const replay = await post(agentOf(), 'code/verify', { email: tolerant, code: good });
  expect(replay.body.code).toBe('CODE_INVALID');

  // Five wrong attempts use the code up: the right code on the sixth try is refused.
  const email = rcpt();
  const code = await mailedCode(email);
  for (let i = 0; i < 5; i += 1) {
    await post(agentOf(), 'code/verify', { email, code: wrongOf(code) });
  }
  const res = await post(agentOf(), 'code/verify', { email, code });
  expect(res.status).toBe(400);
  expect(res.body.code).toBe('CODE_INVALID');
  expect(res.headers['set-cookie']).toBeUndefined();
  expect(await db.user.count({ where: { email } })).toBe(0);
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
  expect((await post(agent, 'password', { password: 'provisional pw' })).status).toBe(204);
  // Before the claim the password opens the provisional account.
  const before = agentOf();
  expect((await post(before, 'login', { email, password: 'provisional pw' })).status).toBe(204);
  expect((await before.get('/api/v1/auth/me')).body.user.id).toBe(provisional.id);

  await loginByCode(email);
  expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  expect((await before.get('/api/v1/auth/me')).status).toBe(401);
  expect((await agent.get('/api/v1/access')).body).toEqual({ state: { kind: 'none' } });
  expect(await db.session.count({ where: { userId: provisional.id } })).toBe(0);
  // Its password no longer signs in either: the account is closed.
  const login = await post(agentOf(), 'login', { email, password: 'provisional pw' });
  expect(login.status).toBe(401);
  expect(login.body.code).toBe('INVALID_CREDENTIALS');
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

it('a provisional password opens only the provisional account, never the verified one', async () => {
  const email = rcpt();
  const verified = await db.user.create({
    data: { email, role: 'user', passwordHash: await hashPassword('verified pw') },
  });
  const { agent } = await buyAndPay(email);
  expect((await post(agent, 'password', { password: 'provisional pw' })).status).toBe(204);
  const provisional = await db.user.findFirstOrThrow({ where: { checkoutEmail: email } });
  expect(provisional.isProvisional).toBe(true);

  const byProvisional = agentOf();
  expect((await post(byProvisional, 'login', { email, password: 'provisional pw' })).status).toBe(
    204,
  );
  expect((await byProvisional.get('/api/v1/auth/me')).body.user).toEqual({
    id: provisional.id,
    email: null,
    role: 'user',
  });
  expect((await byProvisional.get('/api/v1/access')).body.state.kind).toBe('active');

  const byVerified = agentOf();
  expect((await post(byVerified, 'login', { email, password: 'verified pw' })).status).toBe(204);
  expect((await byVerified.get('/api/v1/auth/me')).body.user).toEqual({
    id: verified.id,
    email,
    role: 'user',
  });
  // The verified account has no purchase of its own: the payment stayed provisional.
  expect((await byVerified.get('/api/v1/access')).body.state.kind).toBe('none');
});

it('unpaid provisional accounts do not crowd out a paid one at login', async () => {
  const email = rcpt();
  const { agent } = await buyAndPay(email);
  expect((await post(agent, 'password', { password: 'paid password' })).status).toBe(204);
  const paid = await db.user.findFirstOrThrow({ where: { checkoutEmail: email } });
  // Newer, unpaid, with passwords: they are not candidates.
  const passwordHash = await hashPassword('unpaid password');
  for (let i = 0; i < 5; i += 1) {
    await db.user.create({
      data: { isProvisional: true, checkoutEmail: email, role: 'user', passwordHash },
    });
  }

  const other = agentOf();
  expect((await post(other, 'login', { email, password: 'paid password' })).status).toBe(204);
  expect((await other.get('/api/v1/auth/me')).body.user.id).toBe(paid.id);
  const unpaid = await post(agentOf(), 'login', { email, password: 'unpaid password' });
  expect(unpaid.status).toBe(401);
  expect(unpaid.body.code).toBe('INVALID_CREDENTIALS');
});

it('checkout by a provisional buyer closed by a claim is refused and creates no order', async () => {
  const email = rcpt();
  await buyAndPay(email);
  const provisional = await db.user.findFirstOrThrow({ where: { checkoutEmail: email } });
  await loginByCode(email);
  expect((await db.user.findUniqueOrThrow({ where: { id: provisional.id } })).blockedAt).not.toBe(
    null,
  );
  const ordersBefore = await db.order.count();
  const subsBefore = await db.subscription.count();

  // The session was resolved before the claim, as for a request already in flight.
  const checkout = app.get(CheckoutService);
  const err = await checkout
    .openOrder(
      { checkoutKey: randomUUID(), email, acceptTerms: true },
      {
        userId: provisional.id,
        role: 'user',
        sessionId: 'gone',
        kind: 'user',
        deviceId: null,
      },
    )
    .catch((e: unknown) => e);
  expect(err).toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
  expect(await db.order.count()).toBe(ordersBefore);
  expect(await db.subscription.count()).toBe(subsBefore);
});

it("a grant to a guest buyer's email before the code login chains after the paid period", async () => {
  const email = rcpt();
  const { order, until: paidEnd } = await buyAndPay(email);
  const guest = order.userId;

  const staff = await db.user.create({
    data: { email: `admin-${randomUUID()}@xstorex.ru`, role: 'admin' },
  });
  const { token } = await app.get(SessionService).create(staff.id, 'staff', {});
  const grant = await request(app.getHttpServer())
    .post('/api/v1/admin/billing/grants')
    .set('Origin', SITE)
    .set('Cookie', `xs_session=${token}`)
    .send({ email, days: 30, note: 'Компенсация' });
  expect(grant.status).toBe(201);
  // The compensation starts where the guest's paid period ends, not now.
  expect(grant.body.startsAt).toBe(paidEnd);
  const grantEnd = new Date(new Date(paidEnd).getTime() + 30 * DAY_MS).toISOString();
  expect(grant.body.expiresAt).toBe(grantEnd);
  // The guest account itself is untouched until the claim.
  expect(await db.user.findUniqueOrThrow({ where: { id: guest } })).toMatchObject({
    isProvisional: true,
    email: null,
    blockedAt: null,
  });
  expect(await db.subscription.count({ where: { userId: guest } })).toBe(1);

  const agent = await loginByCode(email);
  const access = await agent.get('/api/v1/access');
  expect(access.body.state).toMatchObject({ kind: 'active', until: grantEnd });
  const rights = await db.entitlement.findMany({
    where: { revokedAt: null },
    orderBy: { startsAt: 'asc' },
  });
  expect(rights).toHaveLength(2);
  expect(rights[1]?.startsAt).toEqual(rights[0]?.expiresAt);

  // A renewal now chains after the whole chain, not inside it.
  const renew = await postCheckout(agent, checkoutBody(randomUUID(), { email }));
  expect(renew.status).toBe(200);
  const renewal = await db.order.findUniqueOrThrow({ where: { id: renew.body.orderId } });
  await fake.setStatus(renewal.providerPaymentId ?? '', 'paid', new Date());
  const raw = Buffer.from(
    JSON.stringify({ paymentId: renewal.providerPaymentId, eventId: `ev-${renewal.id}` }),
  );
  const hook = await request(app.getHttpServer())
    .post('/api/v1/billing/webhooks/fake')
    .set('content-type', 'application/json')
    .set('x-fake-signature', fakeWebhookSignature(TEST_WEBHOOK_SECRET, raw))
    .send(raw.toString('utf8'));
  expect(hook.status).toBe(204);
  const renewed = await db.entitlement.findUniqueOrThrow({ where: { orderId: renewal.id } });
  expect(renewed.startsAt.toISOString()).toBe(grantEnd);
  const after = await agent.get('/api/v1/access');
  expect(after.body.state.until).toBe(renewed.expiresAt.toISOString());
});

it('claim moves future rights after the buyer chain', async () => {
  const email = rcpt();
  // A guest pays, then renews from the same browser: the renewal waits after the paid period.
  const guest = await buyAndPay(email, new Date(Date.now() - 2 * DAY_MS));
  const renew = await postCheckout(guest.agent, checkoutBody(randomUUID(), { email }));
  expect(renew.status).toBe(200);
  const guestRenewal = await db.order.findUniqueOrThrow({ where: { id: renew.body.orderId } });
  await payByWebhook(guestRenewal, new Date(Date.now() - DAY_MS));
  const future = await db.entitlement.findUniqueOrThrow({ where: { orderId: guestRenewal.id } });
  expect(future.startsAt.getTime()).toBeGreaterThan(Date.now());

  // The verified buyer of the same email has their own access, ending later than the guest's
  // paid period. Built directly: a code login would claim the guest purchases right away.
  const verified = await db.user.create({ data: { email, role: 'user' } });
  const own = await db.subscription.create({ data: { userId: verified.id } });
  const ownStart = new Date(Date.now() - DAY_MS);
  const ownEnd = new Date(ownStart.getTime() + 30 * DAY_MS);
  await db.entitlement.create({
    data: {
      subscriptionId: own.id,
      planCode: 'month',
      durationDays: 30,
      startsAt: ownStart,
      expiresAt: ownEnd,
    },
  });
  expect(ownEnd.getTime()).toBeGreaterThan(future.startsAt.getTime());

  const agent = await loginByCode(email);
  const moved = await db.entitlement.findUniqueOrThrow({ where: { id: future.id } });
  // Same length, starting where the buyer's chain ends: no two rights overlap.
  expect(moved.startsAt).toEqual(ownEnd);
  expect(moved.expiresAt.getTime() - moved.startsAt.getTime()).toBe(
    future.expiresAt.getTime() - future.startsAt.getTime(),
  );
  // Rights that have already started keep their dates.
  const paid = await db.entitlement.findUniqueOrThrow({ where: { orderId: guest.order.id } });
  expect(paid.startsAt.getTime()).toBeLessThan(Date.now());
  expect(paid.expiresAt.toISOString()).toBe(guest.until);

  const access = await agent.get('/api/v1/access');
  expect(access.body.state).toMatchObject({
    kind: 'active',
    until: moved.expiresAt.toISOString(),
  });
});

it('access shows the device bound most recently when the buyer has two', async () => {
  // After a claim a buyer can own their own device and a guest's one on different subscriptions.
  const buyer = await db.user.create({ data: { email: rcpt(), role: 'user' } });
  const device = (udid: string, product: string) =>
    db.device.create({
      data: {
        userId: buyer.id,
        udid,
        product,
        iosVersion: '18.0',
        name: product,
        status: 'pending',
      },
    });
  const older = await device('a'.repeat(40), 'iPhone15,2');
  const newer = await device('b'.repeat(40), 'iPad13,1');
  // Created first, bound earlier; then the one bound later.
  await db.subscription.create({
    data: { userId: buyer.id, deviceId: older.id, assignedAt: new Date(Date.now() - 2 * DAY_MS) },
  });
  await db.subscription.create({
    data: { userId: buyer.id, deviceId: newer.id, assignedAt: new Date(Date.now() - DAY_MS) },
  });
  // The live access sits on a third subscription without a device.
  const live = await db.subscription.create({ data: { userId: buyer.id } });
  await db.entitlement.create({
    data: {
      subscriptionId: live.id,
      planCode: 'month',
      durationDays: 30,
      startsAt: new Date(Date.now() - DAY_MS),
      expiresAt: new Date(Date.now() + 29 * DAY_MS),
    },
  });
  const { token } = await app.get(SessionService).create(buyer.id, 'user', {});
  const access = await request(app.getHttpServer())
    .get('/api/v1/access')
    .set('Cookie', `xs_session=${token}`);
  expect(access.body.state).toMatchObject({
    kind: 'active',
    subscriptionId: live.id,
    device: { family: 'ipad', ready: false },
  });
});

it("claim keeps the buyer's own device and unbinds the guest's one", async () => {
  const email = rcpt();
  const guest = await buyAndPay(email);
  const device = (userId: string, udid: string, product: string) =>
    db.device.create({
      data: { userId, udid, product, iosVersion: '18.0', name: product, status: 'pending' },
    });
  // The guest connected one iPhone; the verified buyer of the same email another one.
  const guestDevice = await device(guest.order.userId, 'c'.repeat(40), 'iPhone15,2');
  await db.subscription.update({
    where: { id: guest.order.subscriptionId },
    data: { deviceId: guestDevice.id, assignedAt: new Date() },
  });
  const verified = await db.user.create({ data: { email, role: 'user' } });
  const ownDevice = await device(verified.id, 'd'.repeat(40), 'iPhone16,2');
  const own = await db.subscription.create({
    data: {
      userId: verified.id,
      deviceId: ownDevice.id,
      assignedAt: new Date(Date.now() - DAY_MS),
    },
  });
  await db.entitlement.create({
    data: {
      subscriptionId: own.id,
      planCode: 'month',
      durationDays: 30,
      startsAt: new Date(Date.now() - DAY_MS),
      expiresAt: new Date(Date.now() + 29 * DAY_MS),
    },
  });

  const agent = await loginByCode(email);
  expect(await db.subscription.findUniqueOrThrow({ where: { id: own.id } })).toMatchObject({
    deviceId: ownDevice.id,
  });
  expect(
    await db.subscription.findUniqueOrThrow({ where: { id: guest.order.subscriptionId } }),
  ).toMatchObject({ userId: verified.id, deviceId: null, assignedAt: null });
  // Only one device stays bound across the buyer's subscriptions.
  expect(
    await db.subscription.count({ where: { userId: verified.id, deviceId: { not: null } } }),
  ).toBe(1);
  const access = await agent.get('/api/v1/access');
  expect(access.body.state.device).toMatchObject({ model: 'iPhone 15 Pro Max' });
});
