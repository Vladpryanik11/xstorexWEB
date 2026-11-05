import type { INestApplication } from '@nestjs/common';
import { createPrismaClient } from '@xstore/db';
import { resetDatabase } from '@xstore/db/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { SessionService } from '../src/auth/session.service.js';
import { currentTotp } from '../src/auth/totp.js';
import { loadConfig } from '../src/config/config.js';
import { testEnv } from './test-env.js';

const SITE = 'http://localhost:3000';
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const EMAIL = 'admin@xstorex.ru';
// biome-ignore lint/style/noNonNullAssertion: checked by the env file or CI
const dbUrl = process.env.DATABASE_URL_TEST!;
// biome-ignore lint/style/noNonNullAssertion: checked by the env file or CI
const redisUrl = process.env.REDIS_URL_TEST!;

const db = createPrismaClient(dbUrl);
const redis = new Redis(redisUrl);
let app: INestApplication;
let pwHash: string;

const setCookie = (res: { headers: Record<string, unknown> }): string => {
  const value = res.headers['set-cookie'];
  return Array.isArray(value) ? String(value[0]) : '';
};
const totpNow = (): string => currentTotp(SECRET);
const login = (agent: ReturnType<typeof request.agent>, body: object) =>
  agent.post('/api/v1/auth/staff/login').set('Origin', SITE).send(body);

beforeAll(async () => {
  app = await createApp(loadConfig(testEnv({ SITE_URL: SITE })));
  pwHash = await hashPassword('pw');
});

beforeEach(async () => {
  await resetDatabase(dbUrl);
  await redis.flushdb();
  await db.user.create({
    data: { email: EMAIL, role: 'admin', passwordHash: pwHash, totpSecret: SECRET },
  });
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
  redis.disconnect();
});

it('logs in with password and TOTP, then /auth/me returns the admin', async () => {
  const agent = request.agent(app.getHttpServer());
  const res = await login(agent, { email: EMAIL, password: 'pw', totp: totpNow() });
  expect(res.status).toBe(204);
  expect(setCookie(res)).toMatch(/^xs_session=.+; Path=\/; .*HttpOnly.*SameSite=Lax/);
  expect(setCookie(res)).not.toMatch(/Secure/);
  const me = await agent.get('/api/v1/auth/me');
  expect(me.status).toBe(200);
  expect(me.body).toEqual({ user: { id: expect.any(String), email: EMAIL, role: 'admin' } });
});

it('stores only the token hash and writes an audit row', async () => {
  const agent = request.agent(app.getHttpServer());
  const res = await login(agent, { email: EMAIL, password: 'pw', totp: totpNow() });
  const token = /^xs_session=([^;]+)/.exec(setCookie(res))?.[1];
  const session = await db.session.findFirstOrThrow();
  expect(session.id).toMatch(/^[0-9a-f]{64}$/);
  expect(session.id).not.toBe(token);
  expect(session.kind).toBe('staff');
  const ttlHours = (session.expiresAt.getTime() - session.createdAt.getTime()) / 3_600_000;
  expect(Math.round(ttlHours)).toBe(12);
  const audit = await db.auditLog.findMany();
  expect(audit).toMatchObject([
    { action: 'auth.staff.login', entity: 'User', entityId: session.userId },
  ]);
});

it('rejects a wrong code with the uniform message', async () => {
  const res = await login(request(app.getHttpServer()), {
    email: EMAIL,
    password: 'pw',
    totp: '000000',
  });
  expect(res.status).toBe(401);
  expect(res.body).toEqual({
    code: 'INVALID_CREDENTIALS',
    message: 'Неверная почта, пароль или код',
  });
});

it('rejects a wrong password and an unknown email the same way', async () => {
  const server = request(app.getHttpServer());
  const wrong = await login(server, { email: EMAIL, password: 'nope', totp: totpNow() });
  const unknown = await login(server, { email: 'who@xstorex.ru', password: 'pw', totp: totpNow() });
  expect(wrong.status).toBe(401);
  expect(unknown.status).toBe(401);
  expect(wrong.body).toEqual(unknown.body);
  expect(await db.auditLog.count({ where: { action: 'auth.staff.login_failed' } })).toBe(2);
});

it('rejects a replayed TOTP code', async () => {
  const code = totpNow();
  const first = await login(request(app.getHttpServer()), {
    email: EMAIL,
    password: 'pw',
    totp: code,
  });
  const second = await login(request(app.getHttpServer()), {
    email: EMAIL,
    password: 'pw',
    totp: code,
  });
  expect(first.status).toBe(204);
  expect(second.status).toBe(401);
  expect(second.body.code).toBe('INVALID_CREDENTIALS');
});

it('rate-limits the sixth attempt', async () => {
  const server = request(app.getHttpServer());
  for (let i = 0; i < 5; i++) {
    expect((await login(server, { email: EMAIL, password: 'bad', totp: '000000' })).status).toBe(
      401,
    );
  }
  const sixth = await login(server, { email: EMAIL, password: 'pw', totp: totpNow() });
  expect(sixth.status).toBe(429);
  expect(sixth.body).toEqual({
    code: 'RATE_LIMITED',
    message: 'Слишком много запросов, попробуйте позже',
  });
  expect(Number(sixth.headers['retry-after'])).toBeGreaterThan(0);
  expect(Number(sixth.headers['retry-after'])).toBeLessThanOrEqual(900);
});

it('refuses a mutation without a matching Origin', async () => {
  const server = request(app.getHttpServer());
  expect((await server.post('/api/v1/auth/logout')).status).toBe(403);
  const foreign = await server
    .post('/api/v1/auth/staff/login')
    .set('Origin', 'https://evil.example')
    .send({ email: EMAIL, password: 'pw', totp: totpNow() });
  expect(foreign.status).toBe(403);
  expect(foreign.body).toEqual({ code: 'FORBIDDEN', message: 'Нет доступа' });
});

it('a non-staff user cannot use staff login', async () => {
  await db.user.create({
    data: { email: 'user@xstorex.ru', role: 'user', passwordHash: pwHash, totpSecret: SECRET },
  });
  const res = await login(request(app.getHttpServer()), {
    email: 'user@xstorex.ru',
    password: 'pw',
    totp: totpNow(),
  });
  expect(res.status).toBe(401);
  expect(res.body.code).toBe('INVALID_CREDENTIALS');
});

it('a blocked admin cannot log in', async () => {
  await db.user.update({ where: { email: EMAIL }, data: { blockedAt: new Date() } });
  const res = await login(request(app.getHttpServer()), {
    email: EMAIL,
    password: 'pw',
    totp: totpNow(),
  });
  expect(res.status).toBe(401);
});

it('rejects a malformed body with VALIDATION', async () => {
  const res = await login(request(app.getHttpServer()), { email: 'not-an-email', password: '' });
  expect(res.status).toBe(400);
  expect(res.body.code).toBe('VALIDATION');
});

it('/auth/me is 401 without a session', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/auth/me');
  expect(res.status).toBe(401);
  expect(res.body).toEqual({ code: 'UNAUTHORIZED', message: 'Требуется вход' });
  const forged = await request(app.getHttpServer())
    .get('/api/v1/auth/me')
    .set('Cookie', 'xs_session=forged');
  expect(forged.status).toBe(401);
});

it('logout revokes the session and clears the cookie', async () => {
  const agent = request.agent(app.getHttpServer());
  await login(agent, { email: EMAIL, password: 'pw', totp: totpNow() });
  const out = await agent.post('/api/v1/auth/logout').set('Origin', SITE);
  expect(out.status).toBe(204);
  expect(setCookie(out)).toMatch(/^xs_session=;.*Expires=Thu, 01 Jan 1970/);
  expect(await db.session.count()).toBe(0);
  expect(await db.auditLog.count({ where: { action: 'auth.logout' } })).toBe(1);
  expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
});

it('an expired session or a blocked user is not resolved', async () => {
  const sessions = app.get(SessionService);
  const user = await db.user.findUniqueOrThrow({ where: { email: EMAIL } });
  const { token } = await sessions.create(user.id, 'staff', {});
  expect(await sessions.resolve(token)).toMatchObject({
    userId: user.id,
    role: 'admin',
    kind: 'staff',
  });
  await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
  expect(await sessions.resolve(token)).toBeNull();

  const fresh = await sessions.create(user.id, 'staff', {});
  await db.user.update({ where: { id: user.id }, data: { blockedAt: new Date() } });
  expect(await sessions.resolve(fresh.token)).toBeNull();
});
