import { createHash, randomBytes, randomUUID, timingSafeEqual, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@xstore/db';
import { bindDecision, deviceModelName, ErrorCode, maskUdid } from '@xstore/shared';
import { DeviceWaitingNotifier } from '../apple/device-waiting.notifier.js';
import { buyerAccessUntil, buyerSubscription } from '../billing/buyer-subscription.js';
import { DomainError } from '../common/domain-error.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';
import { PrismaService } from '../infra/prisma.service.js';
import { verifyDeviceCms } from './apple-root.js';
import { CmsError, signCms } from './cms.js';
import {
  type DeviceResponse,
  DeviceResponseError,
  parseDeviceResponse,
} from './device-response.js';
import { IdentityError, IdentityStore } from './identity.js';
import { buildEnrollmentProfile } from './profile.js';

/** A downloaded connection file can be answered for 15 minutes, once. */
const NONCE_TTL_MS = 15 * 60 * 1000;
/** 32 random bytes, base64url. */
const NONCE = /^[A-Za-z0-9_-]{43}$/;
const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

/** Where the callback sends iOS back: `/get/iphone?r=<result>`. */
export type EnrollmentResult =
  | 'connected'
  | 'ENROLLMENT_EXPIRED'
  | 'ENROLLMENT_FAILED'
  | 'DEVICE_OWNED'
  | 'DEVICE_LIMIT'
  | 'NO_ACCESS';

/** Only the hash of a nonce is stored, so a database read cannot answer for someone else. */
export const hashNonce = (nonce: string): string =>
  createHash('sha256').update(nonce).digest('hex');

const sameText = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** PEM roots from `ENROLL_TEST_ANCHOR_PATH`; never read in production (config refuses it too). */
function loadTestAnchors(path: string | null): X509Certificate[] {
  if (!path || process.env.NODE_ENV === 'production') return [];
  const pem = readFileSync(path, 'utf8');
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  if (blocks.length === 0) throw new Error('ENROLL_TEST_ANCHOR_PATH has no certificate');
  return blocks.map((block) => new X509Certificate(block));
}

type Tx = Prisma.TransactionClient;
type Bound = { result: 'connected'; deviceId: string; subscriptionId: string; reused: boolean };
type BindOutcome = Bound | { result: Exclude<EnrollmentResult, 'connected'> };

@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);
  private readonly identity: IdentityStore | null;
  private readonly testAnchors: X509Certificate[];
  private readonly siteUrl: string;

  /** `SITE_URL`: the profile's callback URL and the wizard iOS returns to. */
  get site(): string {
    return this.siteUrl;
  }

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly waitingNotifier: DeviceWaitingNotifier,
  ) {
    this.identity = config.enrollment.signer ? new IdentityStore(config.enrollment.signer) : null;
    this.testAnchors = loadTestAnchors(config.enrollment.testAnchorPath);
    this.siteUrl = config.siteUrl;
  }

  /**
   * The signed connection file for the buyer behind `sessionId`: only with live access and no
   * device yet. Each download is a new one-time nonce bound to this buyer and this session.
   */
  async profile(userId: string, sessionId: string): Promise<Buffer> {
    if (!this.identity) throw new DomainError(ErrorCode.ENROLLMENT_UNAVAILABLE, 503);
    const db = this.prisma.client;
    const now = new Date();
    if (!(await buyerAccessUntil(db, userId, now))) {
      throw new DomainError(ErrorCode.NO_ACCESS, 403);
    }
    const device = await db.device.findFirst({ where: { userId }, select: { id: true } });
    if (device) throw new DomainError(ErrorCode.DEVICE_LIMIT, 409);

    let identity: Awaited<ReturnType<IdentityStore['get']>>;
    try {
      identity = await this.identity.get();
    } catch (err) {
      if (!(err instanceof IdentityError)) throw err;
      this.logger.error({ reason: err.message }, 'enrollment signer unavailable');
      throw new DomainError(ErrorCode.ENROLLMENT_UNAVAILABLE, 503);
    }
    const nonce = randomBytes(32).toString('base64url');
    await db.enrollmentSession.create({
      data: {
        nonce: hashNonce(nonce),
        userId,
        sessionId,
        expiresAt: new Date(now.getTime() + NONCE_TTL_MS),
      },
    });
    const xml = buildEnrollmentProfile({
      nonce,
      siteUrl: this.siteUrl,
      payloadUuid: randomUUID().toUpperCase(),
    });
    return signCms(Buffer.from(xml, 'utf8'), identity);
  }

  /**
   * The answer iOS posts after the person installs the connection file. Binds the device to the
   * nonce owner (never to whoever holds a browser session here) and returns where to send iOS.
   */
  async callback(nonce: string | undefined, body: unknown): Promise<EnrollmentResult> {
    if (!nonce || !NONCE.test(nonce)) return 'ENROLLMENT_FAILED';
    const id = hashNonce(nonce);
    const db = this.prisma.client;
    const row = await db.enrollmentSession.findUnique({
      where: { nonce: id },
      select: {
        status: true,
        expiresAt: true,
        userId: true,
        device: { select: { udid: true, userId: true } },
      },
    });
    if (row?.status === 'completed' && row.device) {
      // iOS may post the same answer again: the same device under a spent nonce succeeded.
      const again = await this.readAnswer(body, nonce).catch(() => null);
      const same = again && again.udid === row.device.udid && row.device.userId === row.userId;
      return same ? this.done('connected', again) : this.done('ENROLLMENT_EXPIRED');
    }
    if (row?.status !== 'pending') return this.done('ENROLLMENT_EXPIRED');
    if (row.expiresAt.getTime() <= Date.now() || !(await sourceAlive(db, id, new Date()))) {
      await this.finish(id, 'expired');
      return this.done('ENROLLMENT_EXPIRED');
    }

    let answer: DeviceResponse;
    try {
      answer = await this.readAnswer(body, nonce);
    } catch (err) {
      if (!(err instanceof CmsError || err instanceof DeviceResponseError)) throw err;
      await this.finish(id, 'failed');
      this.logger.warn({ reason: err.message }, 'enrollment answer refused');
      return this.done('ENROLLMENT_FAILED');
    }

    let outcome: BindOutcome;
    try {
      outcome = await db.$transaction((tx) => this.bind(tx, id, row.userId, answer), TX_OPTIONS);
    } catch (err) {
      // Nothing of the failed transaction was kept: the nonce must not stay usable.
      await this.finish(id, 'failed').catch(() => undefined);
      // Another buyer's device with this UDID was created meanwhile.
      if (!isUniqueViolation(err)) throw err;
      outcome = { result: 'DEVICE_OWNED' };
    }
    // A new device waits for supplier files: the owner hears about it once, at the first bind.
    if (outcome.result === 'connected' && !outcome.reused) {
      await this.waitingNotifier.deviceBound(outcome.deviceId);
    }
    return this.done(outcome.result, answer);
  }

  /** Verified device answer whose CHALLENGE is this nonce; throws `CmsError` or `DeviceResponseError`. */
  private async readAnswer(body: unknown, nonce: string): Promise<DeviceResponse> {
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new DeviceResponseError('Empty device answer');
    }
    const { content } = await verifyDeviceCms(body, { testAnchors: this.testAnchors });
    const answer = parseDeviceResponse(content);
    if (!sameText(answer.challenge, nonce)) {
      throw new DeviceResponseError('Challenge does not match');
    }
    return answer;
  }

  /**
   * Locks `checkout:<userId>` (a claim may be closing this buyer), then the subscription, in the
   * order `claimProvisional` documents. Takes the nonce first, so it is spent exactly once.
   */
  private async bind(
    tx: Tx,
    id: string,
    userId: string,
    answer: DeviceResponse,
  ): Promise<BindOutcome> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`checkout:${userId}`}))`;
    const now = new Date();
    const claimed = await tx.enrollmentSession.updateMany({
      where: { nonce: id, status: 'pending', expiresAt: { gt: now } },
      data: { status: 'completed' },
    });
    if (claimed.count === 0) return { result: 'ENROLLMENT_EXPIRED' } as const;
    const refuse = async (
      result: Exclude<EnrollmentResult, 'connected'>,
      status: 'failed' | 'expired' = 'failed',
    ) => {
      await tx.enrollmentSession.update({ where: { nonce: id }, data: { status } });
      return { result } as const;
    };
    if (!(await sourceAlive(tx, id, now))) return refuse('ENROLLMENT_EXPIRED', 'expired');

    const { udid } = answer;
    const hasAccess = (await buyerAccessUntil(tx, userId, now)) !== null;
    const existing = await tx.device.findUnique({
      where: { udid },
      select: { id: true, userId: true, subscription: { select: { id: true } } },
    });
    const own = existing?.userId === userId ? existing : null;
    const other = own
      ? null
      : await tx.device.findFirst({ where: { userId }, select: { udid: true } });
    const decision = bindDecision({
      udidOwnerId: existing?.userId ?? null,
      buyerId: userId,
      buyerDeviceUdid: own ? udid : (other?.udid ?? null),
      udid,
      hasAccess,
    });
    if (!decision.ok) return refuse(decision.code);

    let deviceId: string;
    let subscriptionId: string;
    if (own?.subscription) {
      // The same iPhone again: already bound for good, nothing changes.
      deviceId = own.id;
      subscriptionId = own.subscription.id;
    } else {
      const subscription = await buyerSubscription(tx, userId, now);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${subscription.id}))`;
      const current = await tx.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
        select: { deviceId: true },
      });
      if (current.deviceId && current.deviceId !== own?.id) return refuse('DEVICE_LIMIT');
      deviceId =
        own?.id ??
        (
          await tx.device.create({
            data: {
              userId,
              udid,
              product: answer.product,
              iosVersion: answer.version,
              name: deviceModelName(answer.product),
              status: 'pending',
            },
            select: { id: true },
          })
        ).id;
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { deviceId, assignedAt: now },
      });
      subscriptionId = subscription.id;
    }
    await tx.enrollmentSession.update({ where: { nonce: id }, data: { deviceId } });
    // In the same transaction: a bind is never kept without its audit entry, nor reported failed.
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: 'device.bind',
        entity: 'device',
        entityId: deviceId,
        diff: {
          subscriptionId,
          udid: maskUdid(udid),
          product: answer.product,
          reused: own !== null,
        },
      },
    });
    return { result: 'connected', deviceId, subscriptionId, reused: own !== null } as const;
  }

  private async finish(id: string, status: 'failed' | 'expired'): Promise<void> {
    await this.prisma.client.enrollmentSession.updateMany({
      where: { nonce: id, status: 'pending' },
      data: { status },
    });
  }

  /** Logs the outcome; the UDID only as a mask. */
  private done(result: EnrollmentResult, answer?: DeviceResponse): EnrollmentResult {
    this.logger.log(
      answer ? { result, udid: maskUdid(answer.udid), product: answer.product } : { result },
      'enrollment callback',
    );
    return result;
  }
}

/** The session that downloaded the file is still signed in and its buyer is open. */
async function sourceAlive(
  db: Pick<Tx, 'enrollmentSession'>,
  id: string,
  now: Date,
): Promise<boolean> {
  const row = await db.enrollmentSession.findUnique({
    where: { nonce: id },
    select: {
      session: { select: { expiresAt: true, kind: true } },
      user: { select: { blockedAt: true, role: true } },
    },
  });
  return (
    row !== null &&
    row.session.kind === 'user' &&
    row.session.expiresAt.getTime() > now.getTime() &&
    row.user.role === 'user' &&
    row.user.blockedAt === null
  );
}
