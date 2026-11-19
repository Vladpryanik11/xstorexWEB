import type { X509Certificate } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@xstore/db';
import { encryptSecret } from '@xstore/secrets/encrypt';
import {
  type CertificateUpload,
  type DeviceCard,
  type DeviceCertificateView,
  deviceFamily,
  ErrorCode,
  maskUdid,
  type WaitingDevice,
} from '@xstore/shared';
import {
  checkKit,
  checkRevocation,
  findIssuer,
  parseP12,
  readProfile,
  SigningError,
} from '@xstore/signing';
import { AuditService } from '../audit/audit.service.js';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';
import { CmsError, verifyCms } from '../enrollment/cms.js';
import { PrismaService } from '../infra/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { signingAnchors } from './anchors.js';
import { OCSP_OPTIONS, type OcspOptions } from './ocsp.provider.js';
import { isLive, waitingState } from './waiting.js';

const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

/** Everything a card or the list needs; never the encrypted columns or the profile bytes. */
const DEVICE_SELECT = {
  id: true,
  udid: true,
  name: true,
  product: true,
  status: true,
  user: { select: { email: true, checkoutEmail: true } },
  subscription: {
    select: {
      assignedAt: true,
      createdAt: true,
      entitlements: { select: { startsAt: true, expiresAt: true, revokedAt: true } },
    },
  },
  certificates: {
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      teamId: true,
      certSerial: true,
      certNotAfter: true,
      profileExpiresAt: true,
      createdAt: true,
      endedAt: true,
    },
  },
} satisfies Prisma.DeviceSelect;

type DeviceRow = Prisma.DeviceGetPayload<{ select: typeof DEVICE_SELECT }>;

const emailOf = (row: DeviceRow): string => row.user.email ?? row.user.checkoutEmail ?? '';

/**
 * Supplier certificates: the admin list «Ждут сертификата», upload with checks, removal. The only
 * place in the API that holds a `.p12` in the clear (during the checks of an upload).
 */
@Injectable()
export class DeviceCertificatesService {
  private readonly logger = new Logger(DeviceCertificatesService.name);
  private readonly anchors: X509Certificate[];

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(OCSP_OPTIONS) private readonly ocsp: OcspOptions,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {
    this.anchors = signingAnchors(config.signing.testAnchorPath);
  }

  /** Live devices without working files, plus those whose files end within 7 days. */
  async waiting(now = new Date()): Promise<WaitingDevice[]> {
    const rows = await this.prisma.client.device.findMany({
      where: { subscription: { isNot: null } },
      select: DEVICE_SELECT,
    });
    const out: WaitingDevice[] = [];
    for (const row of rows) {
      const view = this.waitingOf(row, now);
      if (view) out.push(view);
    }
    return out.sort((a, b) => a.since.localeCompare(b.since));
  }

  /** The menu counter: devices that need files now (`expiring` not counted). */
  async waitingCount(now = new Date()): Promise<number> {
    return (await this.waiting(now)).filter((d) => d.reason !== 'expiring').length;
  }

  async card(deviceId: string, now = new Date()): Promise<DeviceCard> {
    const row = await this.prisma.client.device.findUnique({
      where: { id: deviceId },
      select: DEVICE_SELECT,
    });
    if (!row) throw new DomainError(ErrorCode.NOT_FOUND, 404);
    const waiting = this.waitingOf(row, now);
    return {
      id: row.id,
      email: emailOf(row),
      model: row.name,
      family: deviceFamily(row.product),
      udid: row.udid,
      status: row.status,
      live: row.subscription ? isLive(row.subscription.entitlements, now) : false,
      waiting: waiting
        ? {
            reason: waiting.reason,
            since: waiting.since,
            overdue: waiting.overdue,
            ...(waiting.expiresAt ? { expiresAt: waiting.expiresAt } : {}),
          }
        : null,
      certificates: row.certificates.map(
        (c): DeviceCertificateView => ({
          id: c.id,
          status: c.status,
          teamId: c.teamId,
          certSerial: c.certSerial,
          certNotAfter: c.certNotAfter.toISOString(),
          profileExpiresAt: c.profileExpiresAt.toISOString(),
          createdAt: c.createdAt.toISOString(),
          endedAt: c.endedAt?.toISOString() ?? null,
        }),
      ),
    };
  }

  /**
   * Checks the supplier files against this device (spec §5.2), stores them encrypted, makes the
   * device ready and writes to the buyer. Any refusal stores nothing.
   */
  async upload(deviceId: string, body: CertificateUpload, actor: Actor): Promise<DeviceCard> {
    const keyring = this.config.keyring;
    if (!keyring) throw new DomainError(ErrorCode.SIGNING_UNAVAILABLE, 503);
    const db = this.prisma.client;
    const device = await db.device.findUnique({ where: { id: deviceId }, select: DEVICE_SELECT });
    if (!device) throw new DomainError(ErrorCode.NOT_FOUND, 404);
    if (!device.subscription || !isLive(device.subscription.entitlements, new Date())) {
      throw new DomainError(ErrorCode.NO_ACCESS, 422);
    }

    const p12 = Buffer.from(body.p12, 'base64');
    const profileDer = Buffer.from(body.profile, 'base64');
    const facts = await this.check(p12, body.password, profileDer, device.udid);

    const p12Enc = encryptSecret(p12, keyring);
    const p12PasswordEnc = encryptSecret(body.password, keyring);
    p12.fill(0);

    const { hadFiles, certificateId } = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Device" WHERE id = ${deviceId} FOR UPDATE`;
      const now = new Date();
      const rights = await tx.entitlement.findMany({
        where: { subscription: { deviceId } },
        select: { startsAt: true, expiresAt: true, revokedAt: true },
      });
      if (!isLive(rights, now)) throw new DomainError(ErrorCode.NO_ACCESS, 422);
      const hadFiles = (await tx.deviceCertificate.count({ where: { deviceId } })) > 0;
      await tx.deviceCertificate.updateMany({
        where: { deviceId, status: 'active' },
        data: { status: 'replaced', endedAt: now },
      });
      const created = await tx.deviceCertificate.create({
        data: {
          deviceId,
          p12Enc,
          p12PasswordEnc,
          profile: profileDer,
          profileUuid: facts.profileUuid,
          teamId: facts.teamId,
          appIdPattern: facts.appIdPattern,
          certSerial: facts.certSerial,
          certSha1: facts.certSha1,
          certNotAfter: facts.certNotAfter,
          profileExpiresAt: facts.profileExpiresAt,
          uploadedById: actor.userId,
        },
        select: { id: true },
      });
      await tx.device.update({ where: { id: deviceId }, data: { status: 'active' } });
      return { hadFiles, certificateId: created.id };
    }, TX_OPTIONS);

    // The files are stored: follow-ups never undo the upload, their errors are only logged.
    await this.audit
      .record({
        actorId: actor.userId,
        ip: actor.ip,
        action: 'device.certificate.upload',
        entity: 'device',
        entityId: deviceId,
        diff: {
          certificateId,
          udid: maskUdid(device.udid),
          teamId: facts.teamId,
          certSerial: facts.certSerial,
          certNotAfter: facts.certNotAfter.toISOString(),
          profileExpiresAt: facts.profileExpiresAt.toISOString(),
          replaced: hadFiles,
        },
      })
      .catch((err: unknown) => this.logger.error({ err: String(err) }, 'audit failed'));
    const to = emailOf(device);
    if (to) {
      await this.mail
        .send(hadFiles ? 'reinstall_apps' : 'device_ready', to, {
          family: deviceFamily(device.product),
        })
        .catch((err: unknown) => this.logger.error({ err: String(err) }, 'mail failed'));
    }
    return this.card(deviceId);
  }

  /** Removes the working files (uploaded by mistake): the device waits again. */
  async remove(deviceId: string, actor: Actor): Promise<DeviceCard> {
    const db = this.prisma.client;
    const removed = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Device" WHERE id = ${deviceId} FOR UPDATE`;
      const now = new Date();
      const done = await tx.deviceCertificate.updateMany({
        where: { deviceId, status: 'active' },
        data: { status: 'deleted', endedAt: now },
      });
      if (done.count === 0) return false;
      await tx.device.update({ where: { id: deviceId }, data: { status: 'processing' } });
      return true;
    }, TX_OPTIONS);
    if (!removed) throw new DomainError(ErrorCode.NOT_FOUND, 404);
    await this.audit
      .record({
        actorId: actor.userId,
        ip: actor.ip,
        action: 'device.certificate.delete',
        entity: 'device',
        entityId: deviceId,
      })
      .catch((err: unknown) => this.logger.error({ err: String(err) }, 'audit failed'));
    return this.card(deviceId);
  }

  private async check(p12: Buffer, password: string, profileDer: Buffer, udid: string) {
    let content: Buffer;
    try {
      // The profile's own dates decide freshness; Apple's signing certificate may be older.
      ({ content } = await verifyCms(profileDer, { anchors: this.anchors, checkValidity: false }));
    } catch (err) {
      if (err instanceof CmsError) throw new DomainError(ErrorCode.PROFILE_INVALID, 422);
      throw err;
    }
    try {
      const parsed = await parseP12(p12, password);
      const facts = checkKit({ p12: parsed, profile: readProfile(content), udid, now: new Date() });
      const issuer = findIssuer(parsed.certificate, parsed.chain);
      if (issuer) {
        const state = await checkRevocation(parsed.certificate, issuer, this.ocsp);
        if (state === 'revoked') throw new SigningError('CERT_REVOKED');
      }
      return facts;
    } catch (err) {
      if (err instanceof SigningError) {
        throw new DomainError(
          ErrorCode[err.code],
          422,
          err.code === 'UDID_NOT_IN_PROFILE' ? [maskUdid(udid)] : undefined,
        );
      }
      throw err;
    }
  }

  private waitingOf(row: DeviceRow, now: Date): WaitingDevice | null {
    if (!row.subscription || !isLive(row.subscription.entitlements, now)) return null;
    const assignedAt = row.subscription.assignedAt ?? row.subscription.createdAt;
    const state = waitingState(row.certificates, assignedAt, now);
    if (!state) return null;
    return {
      id: row.id,
      email: emailOf(row),
      model: row.name,
      family: deviceFamily(row.product),
      udid: row.udid,
      ...state,
    };
  }
}
