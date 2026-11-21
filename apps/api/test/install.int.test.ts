import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { createPrismaClient } from '@xstore/db';
import { resetDatabase } from '@xstore/db/testing';
import { QueueName } from '@xstore/shared';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { SessionService } from '../src/auth/session.service.js';
import { loadConfig } from '../src/config/config.js';
import { QUEUES, type Queues } from '../src/infra/queues.provider.js';
import { SITE, seedPlan } from './helpers/billing.js';
import { testEnv } from './test-env.js';

const DAY = 86_400_000;
let app: INestApplication;
// biome-ignore lint/style/noNonNullAssertion: checked by the env file or CI
const db = createPrismaClient(process.env.DATABASE_URL_TEST!);
// biome-ignore lint/style/noNonNullAssertion: checked by the env file or CI
const redis = new Redis(process.env.REDIS_URL_TEST!);

beforeAll(async () => {
  app = await createApp(loadConfig(testEnv({ SITE_URL: SITE })));
});
beforeEach(async () => {
  // biome-ignore lint/style/noNonNullAssertion: checked above
  await resetDatabase(process.env.DATABASE_URL_TEST!);
  await redis.flushdb();
  await signingQueue().obliterate({ force: true });
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
  redis.disconnect();
});

const signingQueue = () => app.get<Queues>(QUEUES)[QueueName.signing];
const server = () => request(app.getHttpServer());

function as(cookie: string) {
  return {
    get: (path: string) => server().get(`/api/v1${path}`).set('Cookie', cookie),
    post: (path: string, body?: object) =>
      server().post(`/api/v1${path}`).set('Origin', SITE).set('Cookie', cookie).send(body),
  };
}

/** A buyer with live access, a bound device (ready unless said otherwise) and a published app. */
async function buyer(
  opts: {
    deviceStatus?: 'active' | 'pending';
    appIdPattern?: string;
    accessDays?: number;
    product?: string;
  } = {},
) {
  const tag = randomBytes(4).toString('hex');
  const owner = await db.user.create({ data: { email: `o-${tag}@x.test`, role: 'admin' } });
  const user = await db.user.create({ data: { email: `b-${tag}@x.test`, role: 'user' } });
  const device = await db.device.create({
    data: {
      userId: user.id,
      udid: `00008110-${tag.toUpperCase()}00000000`,
      product: opts.product ?? 'iPhone16,2',
      iosVersion: '18.1',
      name: 'iPhone',
      status: opts.deviceStatus ?? 'active',
    },
  });
  const sub = await db.subscription.create({
    data: { userId: user.id, deviceId: device.id, assignedAt: new Date() },
  });
  const from = new Date(Date.now() - (opts.accessDays === 0 ? 40 : 1) * DAY);
  const days = opts.accessDays || 30;
  await db.entitlement.create({
    data: {
      subscriptionId: sub.id,
      planCode: 'month',
      durationDays: days,
      startsAt: from,
      expiresAt: new Date(from.getTime() + days * DAY),
    },
  });
  const cert =
    opts.deviceStatus === 'pending'
      ? null
      : await db.deviceCertificate.create({
          data: {
            deviceId: device.id,
            p12Enc: 'v1.x.x.x',
            p12PasswordEnc: 'v1.x.x.x',
            profile: new Uint8Array([1]),
            profileUuid: 'u',
            teamId: 'TEAM123456',
            appIdPattern: opts.appIdPattern ?? 'TEAM123456.*',
            certSerial: '01',
            certSha1: tag,
            certNotAfter: new Date(Date.now() + 300 * DAY),
            profileExpiresAt: new Date(Date.now() + 300 * DAY),
            uploadedById: owner.id,
          },
        });
  const { token } = await app.get(SessionService).create(user.id, 'user', {});
  return { user, device, cert, http: as(`xs_session=${token}`) };
}

async function publishedApp(name = 'Пример', deviceFamily = [1, 2]) {
  const tag = randomBytes(4).toString('hex');
  const a = await db.app.create({
    data: {
      slug: `app-${tag}`,
      name,
      status: 'published',
      rightsBasis: 'test',
      iconKey: `apps/${tag}/icon.png`,
    },
  });
  const version = await db.appVersion.create({
    data: {
      appId: a.id,
      version: '2.1',
      build: '7',
      bundleId: `com.example.${tag}`,
      sizeBytes: 10n,
      sha256: 'x',
      ipaKey: `catalog/${tag}.ipa`,
      encrypted: false,
      deviceFamily,
      status: 'published',
      publishedAt: new Date(),
    },
  });
  return { app: a, version };
}

/** What the worker does when it finishes: one copy, every open request ready. */
async function finishSigning(jobId: string, bundleId = 'com.example.signed') {
  const row = await db.signingJob.findUniqueOrThrow({ where: { id: jobId } });
  const build = await db.signedBuild.create({
    data: {
      appVersionId: row.appVersionId,
      deviceCertificateId: row.deviceCertificateId,
      key: `${row.deviceCertificateId}/${row.appVersionId}.ipa`,
      sizeBytes: 10n,
      bundleId,
    },
  });
  await db.signingJob.updateMany({
    where: { queueJobId: row.queueJobId },
    data: { stage: 'ready', signedBuildId: build.id },
  });
  return build;
}

const tokenOf = (itmsUrl: string) => {
  const manifest = decodeURIComponent(
    new URL(itmsUrl.replace('itms-services://', 'https://x/')).searchParams.get('url') ?? '',
  );
  expect(manifest.startsWith(`${SITE}/api/v1/install/`)).toBe(true);
  return new URL(manifest).pathname.replace('/api/v1', '');
};

describe('install request', () => {
  it('signs on first request and serves the copy on the second', async () => {
    const b = await buyer();
    const { app: a } = await publishedApp();
    const first = await b.http.post(`/install/apps/${a.slug}`);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ jobId: expect.any(String), stage: 'queued' });
    const queued = await signingQueue().getJobs(['waiting']);
    expect(queued).toHaveLength(1);
    expect(queued[0]?.data).toEqual({ signingJobId: first.body.jobId });

    expect((await b.http.post(`/install/jobs/${first.body.jobId}/token`)).status).toBe(409);
    await finishSigning(first.body.jobId);
    expect((await b.http.get(`/install/jobs/${first.body.jobId}`)).body).toEqual({
      jobId: first.body.jobId,
      stage: 'ready',
    });
    const link = await b.http.post(`/install/jobs/${first.body.jobId}/token`);
    expect(link.status).toBe(200);
    expect(link.body.itmsUrl).toMatch(/^itms-services:\/\/\?action=download-manifest&url=/);

    const second = await b.http.post(`/install/apps/${a.slug}`);
    expect(second.body).toEqual({ jobId: expect.any(String), stage: 'ready' });
    expect(await signingQueue().count()).toBe(1);
  });

  it('second request joins the running job', async () => {
    const b = await buyer();
    const { app: a } = await publishedApp();
    const one = await b.http.post(`/install/apps/${a.slug}`);
    const two = await b.http.post(`/install/apps/${a.slug}`);
    expect(one.body.jobId).not.toBe(two.body.jobId);
    expect(await signingQueue().count()).toBe(1);
    await finishSigning(one.body.jobId);
    expect((await b.http.get(`/install/jobs/${two.body.jobId}`)).body.stage).toBe('ready');
  });

  it('not ready device is refused', async () => {
    const b = await buyer({ deviceStatus: 'pending' });
    const { app: a } = await publishedApp();
    const res = await b.http.post(`/install/apps/${a.slug}`);
    expect([res.status, res.body.code]).toEqual([409, 'DEVICE_NOT_READY']);
    expect(await db.signingJob.count()).toBe(0);
  });

  it('ended access is refused', async () => {
    const b = await buyer({ accessDays: 0 });
    const { app: a } = await publishedApp();
    const res = await b.http.post(`/install/apps/${a.slug}`);
    expect([res.status, res.body.code]).toEqual([403, 'NO_ACCESS']);
  });

  it('an iPad-only app is refused on an iPhone', async () => {
    const b = await buyer();
    const { app: a } = await publishedApp('iPad', [2]);
    const res = await b.http.post(`/install/apps/${a.slug}`);
    expect([res.status, res.body.code]).toEqual([422, 'WRONG_DEVICE']);
  });

  it('a guest is asked to sign in', async () => {
    const { app: a } = await publishedApp();
    const res = await server().post(`/api/v1/install/apps/${a.slug}`).set('Origin', SITE);
    expect(res.status).toBe(401);
  });

  it('another user cannot see my job', async () => {
    const b = await buyer();
    const other = await buyer();
    const { app: a } = await publishedApp();
    const { body } = await b.http.post(`/install/apps/${a.slug}`);
    expect((await other.http.get(`/install/jobs/${body.jobId}`)).status).toBe(404);
    await finishSigning(body.jobId);
    expect((await other.http.post(`/install/jobs/${body.jobId}/token`)).status).toBe(404);
  });

  it('warns before replacing the previous app on a single-app profile', async () => {
    const b = await buyer({ appIdPattern: 'TEAM123456.ru.supplier.one' });
    const first = await publishedApp('Первое');
    const second = await publishedApp('Второе');
    // Nothing installed yet: no question.
    const job = await b.http.post(`/install/apps/${first.app.slug}`);
    expect(job.status).toBe(200);
    await db.installEvent.create({ data: { appId: first.app.id, deviceId: b.device.id } });
    // The same app again: no question either.
    expect((await b.http.post(`/install/apps/${first.app.slug}`)).status).toBe(200);
    const asked = await b.http.post(`/install/apps/${second.app.slug}`);
    expect([asked.status, asked.body.code, asked.body.details]).toEqual([
      409,
      'REPLACES_APP',
      ['Первое'],
    ]);
    const confirmed = await b.http.post(`/install/apps/${second.app.slug}`, {
      confirmReplace: true,
    });
    expect(confirmed.status).toBe(200);
  });

  it('a wildcard profile never asks', async () => {
    const b = await buyer();
    const first = await publishedApp('Первое');
    const second = await publishedApp('Второе');
    await db.installEvent.create({ data: { appId: first.app.id, deviceId: b.device.id } });
    expect((await b.http.post(`/install/apps/${second.app.slug}`)).status).toBe(200);
  });
});

describe('the app chosen before payment', () => {
  async function paidOrder(userId: string, returnTo: string | null, paidAt = new Date()) {
    const plan = await seedPlan(db).catch(() => db.plan.findFirstOrThrow({ select: { id: true } }));
    const sub = await db.subscription.findFirstOrThrow({ where: { userId } });
    return db.order.create({
      data: {
        userId,
        subscriptionId: sub.id,
        planId: plan.id,
        planSnapshot: {},
        checkoutEmail: 'b@x.test',
        checkoutKey: randomBytes(8).toString('hex'),
        returnTo,
        amountRub: 299,
        status: 'paid',
        provider: 'fake',
        paidAt,
        expiresAt: new Date(Date.now() + DAY),
      },
    });
  }

  it('is the app of the latest paid order', async () => {
    const b = await buyer();
    const older = await publishedApp('Старое');
    const { app: chosen } = await publishedApp('Выбранное');
    await paidOrder(b.user.id, `/app/${older.app.slug}`, new Date(Date.now() - DAY));
    await paidOrder(b.user.id, `/app/${chosen.slug}`);
    const res = await b.http.get('/install/chosen');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ app: { slug: chosen.slug, name: 'Выбранное' } });
  });

  it('is none without an app page or once the app is hidden', async () => {
    const b = await buyer();
    expect((await b.http.get('/install/chosen')).body).toEqual({ app: null });
    const { app: hidden } = await publishedApp('Скрытое');
    await db.app.update({ where: { id: hidden.id }, data: { status: 'hidden' } });
    await paidOrder(b.user.id, `/app/${hidden.slug}`);
    expect((await b.http.get('/install/chosen')).body).toEqual({ app: null });
  });

  it('a guest is asked to sign in', async () => {
    expect((await server().get('/api/v1/install/chosen')).status).toBe(401);
  });
});

describe('manifest', () => {
  async function link() {
    const b = await buyer();
    const { app: a } = await publishedApp('Tom & Jerry');
    const { body } = await b.http.post(`/install/apps/${a.slug}`);
    await finishSigning(body.jobId, 'com.example.signed');
    const res = await b.http.post(`/install/jobs/${body.jobId}/token`);
    return { b, a, path: tokenOf(res.body.itmsUrl) };
  }
  const fetchManifest = (path: string, ua = 'com.apple.appstored/1.0') =>
    server().get(`/api/v1${path}`).set('User-Agent', ua);

  it('serves a manifest with a short IPA link and counts one install', async () => {
    const { a, path } = await link();
    const res = await fetchManifest(path);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/xml/);
    expect(res.headers['cache-control']).toBe('no-store');
    const xml = res.text;
    expect(xml).toContain('<string>com.example.signed</string>');
    expect(xml).toContain('<string>Tom &amp; Jerry</string>');
    expect(xml).toContain('<string>2.1</string>');
    expect(xml).toMatch(/X-Amz-Expires=900/);
    expect(xml).toContain(`${process.env.S3_PUBLIC_URL}/`);
    expect(await db.installEvent.count({ where: { appId: a.id } })).toBe(1);
  });

  it('refetch within the window', async () => {
    const { path } = await link();
    expect((await fetchManifest(path)).status).toBe(200);
    expect((await fetchManifest(path)).status).toBe(200);
    expect(await db.installEvent.count()).toBe(1);
  });

  it('used link is gone', async () => {
    const { path } = await link();
    expect((await fetchManifest(path)).status).toBe(200);
    const other = await fetchManifest(path, 'Other/1.0');
    expect([other.status, other.body.code]).toEqual([410, 'INSTALL_LINK_USED']);
  });

  it('expired link', async () => {
    const { path } = await link();
    await db.installToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await fetchManifest(path);
    expect([res.status, res.body.code]).toEqual([410, 'INSTALL_LINK_EXPIRED']);
  });

  it('unknown token', async () => {
    const res = await fetchManifest(`/install/${'A'.repeat(43)}/manifest.plist`);
    expect(res.status).toBe(410);
  });

  it('a link is not issued once the device files changed', async () => {
    const b = await buyer();
    const { app: a } = await publishedApp();
    const { body } = await b.http.post(`/install/apps/${a.slug}`);
    await finishSigning(body.jobId);
    await db.deviceCertificate.updateMany({ data: { status: 'replaced' } });
    const res = await b.http.post(`/install/jobs/${body.jobId}/token`);
    expect([res.status, res.body.code]).toEqual([409, 'DEVICE_NOT_READY']);
  });
});

describe('admin signing jobs', () => {
  async function staff(role: 'admin' | 'support') {
    const u = await db.user.create({
      data: { email: `${role}-${randomBytes(3).toString('hex')}@x.test`, role },
    });
    const { token } = await app.get(SessionService).create(u.id, 'staff', {});
    return as(`xs_session=${token}`);
  }

  it('support sees signing jobs, a buyer does not', async () => {
    const b = await buyer();
    const { app: a } = await publishedApp('Список');
    await b.http.post(`/install/apps/${a.slug}`);
    const res = await (await staff('support')).get('/admin/signing-jobs');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        app: 'Список',
        version: '2.1',
        stage: 'queued',
        email: expect.any(String),
        failReason: null,
      }),
    ]);
    // A job waiting for disk space shows why, to staff only.
    await db.signingJob.updateMany({ data: { failReason: 'DISK_FULL' } });
    const waiting = await (await staff('support')).get('/admin/signing-jobs');
    expect(waiting.body[0].failReason).toBe('DISK_FULL');
    expect((await b.http.get('/admin/signing-jobs')).status).toBe(403);
  });

  it('only admin retries a failed job', async () => {
    const b = await buyer();
    const { app: a } = await publishedApp();
    const { body } = await b.http.post(`/install/apps/${a.slug}`);
    await signingQueue().obliterate({ force: true });
    const support = await staff('support');
    const admin = await staff('admin');
    expect((await admin.post(`/admin/signing-jobs/${body.jobId}/retry`)).status).toBe(409);
    await db.signingJob.update({
      where: { id: body.jobId },
      data: { stage: 'failed', errorCode: 'SIGNING_FAILED' },
    });
    expect((await support.post(`/admin/signing-jobs/${body.jobId}/retry`)).status).toBe(403);
    expect((await admin.post(`/admin/signing-jobs/${body.jobId}/retry`)).status).toBe(200);
    expect((await db.signingJob.findUniqueOrThrow({ where: { id: body.jobId } })).stage).toBe(
      'queued',
    );
    expect(await signingQueue().count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: 'signing.retry' } })).toBe(1);
  });
});
