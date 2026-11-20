import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { createFakeProvider, fakeWebhookSignature } from '@xstore/billing';
import { createPrismaClient } from '@xstore/db';
import { resetDatabase } from '@xstore/db/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { SessionService } from '../src/auth/session.service.js';
import { loadConfig } from '../src/config/config.js';
import { checkoutBody, postCheckout, SITE, seedPlan } from './helpers/billing.js';
import { TEST_WEBHOOK_SECRET, testEnv } from './test-env.js';

// biome-ignore lint/style/noNonNullAssertion: checked by the env file or CI
const dbUrl = process.env.DATABASE_URL_TEST!;
// biome-ignore lint/style/noNonNullAssertion: checked by the env file or CI
const redisUrl = process.env.REDIS_URL_TEST!;

const db = createPrismaClient(dbUrl);
const redis = new Redis(redisUrl);
const fake = createFakeProvider(redis, { siteUrl: SITE, webhookSecret: TEST_WEBHOOK_SECRET });
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

const agentOf = () => request.agent(app.getHttpServer());
type Agent = ReturnType<typeof agentOf>;

const issue = (agent: Agent) => agent.post('/api/v1/auth/handoff').set('Origin', SITE).send({});
const redeem = (agent: Agent, token: string) =>
  agent.post('/api/v1/auth/handoff/redeem').set('Origin', SITE).send({ token });

/** A guest who paid without a password: the case the link exists for. */
async function guestBuyer() {
  const agent = agentOf();
  const res = await postCheckout(
    agent,
    checkoutBody(randomUUID(), { email: `h-${randomUUID()}@example.ru` }),
  );
  expect(res.status).toBe(200);
  const order = await db.order.findUniqueOrThrow({ where: { id: res.body.orderId } });
  const paymentId = order.providerPaymentId ?? '';
  await fake.setStatus(paymentId, 'paid', new Date(Date.now() - 60_000));
  const raw = Buffer.from(JSON.stringify({ paymentId, eventId: `ev-${order.id}` }));
  const hook = await request(app.getHttpServer())
    .post('/api/v1/billing/webhooks/fake')
    .set('content-type', 'application/json')
    .set('x-fake-signature', fakeWebhookSignature(TEST_WEBHOOK_SECRET, raw))
    .send(raw.toString('utf8'));
  expect(hook.status).toBe(204);
  return { agent, userId: order.userId };
}

it('carries the sign-in of a guest buyer into another browser once', async () => {
  const { agent, userId } = await guestBuyer();
  const res = await issue(agent);
  expect(res.status).toBe(200);
  expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const expiresAt = new Date(res.body.expiresAt).getTime();
  expect(expiresAt - Date.now()).toBeGreaterThan(9 * 60_000);
  expect(expiresAt - Date.now()).toBeLessThanOrEqual(10 * 60_000);

  // Only the hash is stored.
  const stored = await db.loginHandoff.findFirstOrThrow();
  expect(stored.tokenHash).toBe(createHash('sha256').update(res.body.token).digest('hex'));
  expect(JSON.stringify(stored)).not.toContain(res.body.token);

  const safari = agentOf();
  expect((await safari.get('/api/v1/access')).body.hasPassword).toBeUndefined();
  const first = await redeem(safari, res.body.token);
  expect(first.status).toBe(204);
  expect(first.headers['set-cookie']?.[0]).toMatch(/HttpOnly/);
  const access = await safari.get('/api/v1/access');
  expect(access.body.state.kind).toBe('active');
  const me = await safari.get('/api/v1/auth/me');
  expect(me.body.user.id).toBe(userId);

  // The first browser stays signed in.
  expect((await agent.get('/api/v1/access')).body.state.kind).toBe('active');

  const again = await redeem(agentOf(), res.body.token);
  expect(again.status).toBe(400);
  expect(again.body.code).toBe('HANDOFF_INVALID');
});

it('a reload in the browser that asked for the link does not spend it', async () => {
  const { agent } = await guestBuyer();
  const { token } = (await issue(agent)).body;
  expect((await redeem(agent, token)).status).toBe(204);
  expect((await db.loginHandoff.findFirstOrThrow()).usedAt).toBeNull();
  expect((await redeem(agentOf(), token)).status).toBe(204);
});

it('an expired link is refused', async () => {
  const { agent } = await guestBuyer();
  const { token } = (await issue(agent)).body;
  await db.loginHandoff.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
  const res = await redeem(agentOf(), token);
  expect(res.status).toBe(400);
  expect(res.body.code).toBe('HANDOFF_INVALID');
});

it('an unknown or malformed token is refused', async () => {
  expect((await redeem(agentOf(), 'x'.repeat(43))).body.code).toBe('HANDOFF_INVALID');
  expect((await redeem(agentOf(), 'short')).status).toBe(400);
});

it('a blocked buyer cannot use a link issued before the block', async () => {
  const { agent, userId } = await guestBuyer();
  const { token } = (await issue(agent)).body;
  await db.user.update({ where: { id: userId }, data: { blockedAt: new Date() } });
  expect((await redeem(agentOf(), token)).body.code).toBe('HANDOFF_INVALID');
});

it('a browser signed in as another buyer keeps its session; the link stays unspent', async () => {
  const one = await guestBuyer();
  const two = await guestBuyer();
  const { token } = (await issue(one.agent)).body;
  expect((await redeem(two.agent, token)).status).toBe(204);
  expect((await two.agent.get('/api/v1/auth/me')).body.user.id).toBe(two.userId);
  expect((await db.loginHandoff.findFirstOrThrow()).usedAt).toBeNull();
});

it('a new link voids the earlier unspent one', async () => {
  const { agent } = await guestBuyer();
  const first = (await issue(agent)).body.token;
  const second = (await issue(agent)).body.token;
  expect((await redeem(agentOf(), first)).body.code).toBe('HANDOFF_INVALID');
  expect((await redeem(agentOf(), second)).status).toBe(204);
});

it('a new password voids unspent links', async () => {
  const { agent } = await guestBuyer();
  const { token } = (await issue(agent)).body;
  const set = await agent
    .post('/api/v1/auth/password')
    .set('Origin', SITE)
    .send({ password: 'new-password-1' });
  expect(set.status).toBe(204);
  expect((await redeem(agentOf(), token)).body.code).toBe('HANDOFF_INVALID');
});

it('logging out voids unspent links', async () => {
  const { agent } = await guestBuyer();
  const { token } = (await issue(agent)).body;
  expect((await agent.post('/api/v1/auth/logout').set('Origin', SITE).send({})).status).toBe(204);
  expect((await redeem(agentOf(), token)).body.code).toBe('HANDOFF_INVALID');
});

it('only a buyer gets a link, at most ten in ten minutes', async () => {
  expect((await issue(agentOf())).status).toBe(401);
  const staff = await db.user.create({
    data: { email: `admin-${randomUUID()}@xstorex.ru`, role: 'admin' },
  });
  const { token } = await app.get(SessionService).create(staff.id, 'staff', {});
  const staffRes = await request(app.getHttpServer())
    .post('/api/v1/auth/handoff')
    .set('Origin', SITE)
    .set('Cookie', `xs_session=${token}`)
    .send({});
  expect(staffRes.status).toBe(403);

  const { agent } = await guestBuyer();
  for (let i = 0; i < 10; i += 1) expect((await issue(agent)).status).toBe(200);
  expect((await issue(agent)).status).toBe(429);
});
