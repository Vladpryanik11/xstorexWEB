import { Inject, Injectable } from '@nestjs/common';
import {
  buildManifest,
  canInstall,
  ErrorCode,
  type InstallJobView,
  type InstallLink,
  type InstallStage,
  itmsUrl,
  profileKind,
  QueueName,
  signingQueueJobId,
} from '@xstore/shared';
import { buyerAccessUntil } from '../billing/buyer-subscription.js';
import { DomainError } from '../common/domain-error.js';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';
import { PrismaService } from '../infra/prisma.service.js';
import { QUEUES, type Queues } from '../infra/queues.provider.js';
import { StorageService } from '../storage/storage.service.js';
import {
  hashInstallToken,
  IPA_LINK_TTL_SEC,
  mayRefetch,
  newInstallToken,
  TOKEN_TTL_MS,
} from './tokens.js';

export const SIGN_JOB_NAME = 'signing:sign';
/** zsign failures are rarely transient: one retry, soon, so the buyer does not wait long. */
export const SIGN_JOB_OPTIONS = {
  attempts: 2,
  backoff: { type: 'fixed' as const, delay: 5000 },
  removeOnComplete: true,
  removeOnFail: true,
};

type Client = { ip: string | null; ua: string | null };

const view = (row: {
  id: string;
  stage: InstallStage;
  errorCode: string | null;
}): InstallJobView =>
  row.errorCode
    ? { jobId: row.id, stage: row.stage, errorCode: row.errorCode }
    : { jobId: row.id, stage: row.stage };

/**
 * Н4 install (spec 2026-11-21 §4–5): a tap asks for a signed copy of the app for the buyer's
 * device; the worker signs it (queue `signing`) unless a copy exists; the site polls the job,
 * then takes a one-time `itms-services://` link. This module never decrypts device files.
 */
@Injectable()
export class InstallService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(QUEUES) private readonly queues: Queues,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** The buyer's device with its working files, after the live access check. */
  private async readyDevice(userId: string, now: Date) {
    const db = this.prisma.client;
    if (!(await buyerAccessUntil(db, userId, now))) throw new DomainError(ErrorCode.NO_ACCESS, 403);
    const device = await db.device.findFirst({
      where: { userId, subscription: { isNot: null } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        product: true,
        certificates: {
          where: { status: 'active' },
          select: { id: true, status: true, appIdPattern: true, createdAt: true },
          take: 1,
        },
      },
    });
    if (!device) throw new DomainError(ErrorCode.DEVICE_NOT_READY, 409);
    return { device, certificate: device.certificates[0] ?? null };
  }

  async request(
    userId: string,
    slug: string,
    opts: { confirmReplace?: boolean } = {},
  ): Promise<InstallJobView> {
    const db = this.prisma.client;
    const now = new Date();
    const app = await db.app.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        status: true,
        versions: {
          where: { status: 'published' },
          orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
          select: { id: true, status: true, encrypted: true, deviceFamily: true },
        },
      },
    });
    if (!app) throw new DomainError(ErrorCode.NOT_FOUND, 404);
    const { device, certificate } = await this.readyDevice(userId, now);
    const version = app.versions[0] ?? null;
    const verdict = canInstall({ device, certificate, app, version, now });
    if (!verdict.ok) {
      throw new DomainError(
        ErrorCode[verdict.reason],
        verdict.reason === 'DEVICE_NOT_READY' ? 409 : 422,
      );
    }
    // biome-ignore lint/style/noNonNullAssertion: canInstall passed, so both exist
    const cert = certificate!;
    // biome-ignore lint/style/noNonNullAssertion: canInstall passed, so both exist
    const versionId = version!.id;

    // A single-app profile: every app gets the same bundle id and replaces the previous one.
    if (profileKind(cert.appIdPattern) === 'single' && !opts.confirmReplace) {
      const last = await db.installEvent.findFirst({
        where: { deviceId: device.id, createdAt: { gte: cert.createdAt } },
        orderBy: { createdAt: 'desc' },
        select: { appId: true, app: { select: { name: true } } },
      });
      if (last && last.appId !== app.id) {
        throw new DomainError(ErrorCode.REPLACES_APP, 409, [last.app.name]);
      }
    }

    const queueJobId = signingQueueJobId(versionId, cert.id);
    const build = await db.signedBuild.findUnique({
      where: {
        appVersionId_deviceCertificateId: { appVersionId: versionId, deviceCertificateId: cert.id },
      },
      select: { id: true },
    });
    const base = {
      userId,
      deviceId: device.id,
      appVersionId: versionId,
      deviceCertificateId: cert.id,
      queueJobId,
    };
    if (build) {
      const row = await db.signingJob.create({
        data: { ...base, stage: 'ready', signedBuildId: build.id, finishedAt: now },
        select: { id: true, stage: true, errorCode: true },
      });
      return view(row);
    }
    const row = await db.signingJob.create({ data: base, select: { id: true } });
    await this.enqueue(queueJobId, row.id);
    // The worker may have finished the same copy between our check and the row.
    const done = await db.signedBuild.findUnique({
      where: {
        appVersionId_deviceCertificateId: { appVersionId: versionId, deviceCertificateId: cert.id },
      },
      select: { id: true },
    });
    if (done) {
      await db.signingJob.updateMany({
        where: { id: row.id, stage: { notIn: ['ready', 'failed'] } },
        data: { stage: 'ready', signedBuildId: done.id, finishedAt: new Date() },
      });
    }
    return this.job(userId, row.id);
  }

  /** Adds the signing, or joins the one running for the same copy (same BullMQ id). */
  private async enqueue(queueJobId: string, signingJobId: string): Promise<void> {
    const queue = this.queues[QueueName.signing];
    const existing = await queue.getJob(queueJobId);
    if (existing && ((await existing.isCompleted()) || (await existing.isFailed()))) {
      await existing.remove().catch(() => undefined);
    }
    await queue.add(SIGN_JOB_NAME, { signingJobId }, { ...SIGN_JOB_OPTIONS, jobId: queueJobId });
  }

  async job(userId: string, id: string): Promise<InstallJobView> {
    const row = await this.prisma.client.signingJob.findUnique({
      where: { id },
      select: { id: true, userId: true, stage: true, errorCode: true },
    });
    if (!row || row.userId !== userId) throw new DomainError(ErrorCode.NOT_FOUND, 404);
    return view(row);
  }

  /** A one-time link once the copy is ready; access and device files are checked again. */
  async token(userId: string, id: string): Promise<InstallLink> {
    const db = this.prisma.client;
    const now = new Date();
    const row = await db.signingJob.findUnique({
      where: { id },
      select: {
        userId: true,
        stage: true,
        deviceId: true,
        appVersionId: true,
        signedBuild: { select: { id: true, deviceCertificateId: true } },
      },
    });
    if (!row || row.userId !== userId) throw new DomainError(ErrorCode.NOT_FOUND, 404);
    if (row.stage !== 'ready' || !row.signedBuild) throw new DomainError(ErrorCode.CONFLICT, 409);
    const { device, certificate } = await this.readyDevice(userId, now);
    if (
      device.id !== row.deviceId ||
      device.status !== 'active' ||
      certificate?.id !== row.signedBuild.deviceCertificateId
    ) {
      throw new DomainError(ErrorCode.DEVICE_NOT_READY, 409);
    }
    const { token, hash } = newInstallToken();
    const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);
    await db.installToken.create({
      data: {
        tokenHash: hash,
        userId,
        deviceId: device.id,
        signedBuildId: row.signedBuild.id,
        appVersionId: row.appVersionId,
        expiresAt,
      },
    });
    const manifestUrl = `${new URL(this.config.siteUrl).origin}/api/v1/install/${token}/manifest.plist`;
    return { itmsUrl: itmsUrl(manifestUrl), expiresAt: expiresAt.toISOString() };
  }

  /**
   * The manifest behind a link: the first fetch uses the token and counts an install; the same
   * client may fetch again for 120 s (iOS sometimes asks twice). The IPA link lives 15 minutes.
   */
  async manifest(token: string, client: Client): Promise<string> {
    const db = this.prisma.client;
    const now = new Date();
    const row = await db.installToken.findUnique({
      where: { tokenHash: hashInstallToken(token) },
      select: {
        tokenHash: true,
        deviceId: true,
        expiresAt: true,
        usedAt: true,
        usedIp: true,
        usedUa: true,
        signedBuild: { select: { id: true, key: true, bundleId: true } },
        appVersion: {
          select: {
            version: true,
            icon57Key: true,
            app: { select: { id: true, name: true, iconKey: true } },
          },
        },
      },
    });
    if (!row) throw new DomainError(ErrorCode.INSTALL_LINK_EXPIRED, 410);
    if (row.usedAt) {
      if (
        !mayRefetch({ usedAt: row.usedAt, usedIp: row.usedIp, usedUa: row.usedUa }, client, now)
      ) {
        throw new DomainError(ErrorCode.INSTALL_LINK_USED, 410);
      }
    } else {
      if (row.expiresAt <= now) throw new DomainError(ErrorCode.INSTALL_LINK_EXPIRED, 410);
      const claimed = await db.installToken.updateMany({
        where: { tokenHash: row.tokenHash, usedAt: null },
        data: { usedAt: now, usedIp: client.ip, usedUa: client.ua },
      });
      if (claimed.count === 0) return this.manifest(token, client);
      await db.$transaction([
        db.installEvent.create({ data: { appId: row.appVersion.app.id, deviceId: row.deviceId } }),
        db.signedBuild.update({ where: { id: row.signedBuild.id }, data: { lastUsedAt: now } }),
      ]);
    }
    const ipaUrl = await this.storage.presignGet(
      this.storage.bucket('signed'),
      row.signedBuild.key,
      IPA_LINK_TTL_SEC,
    );
    const { app } = row.appVersion;
    const icon57 = row.appVersion.icon57Key ?? app.iconKey;
    return buildManifest({
      ipaUrl,
      icon57Url: icon57 ? this.storage.mediaUrl(icon57) : undefined,
      icon512Url: app.iconKey ? this.storage.mediaUrl(app.iconKey) : undefined,
      bundleId: row.signedBuild.bundleId,
      bundleVersion: row.appVersion.version,
      title: app.name,
    });
  }
}
