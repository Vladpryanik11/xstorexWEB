import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@xstore/db';
import { deviceModelName, ErrorCode } from '@xstore/shared';
import { Redis } from 'ioredis';
import { Certificate } from 'pkijs';
import { z } from 'zod';
import { type SessionMeta, SessionService } from '../auth/session.service.js';
import { DomainError } from '../common/domain-error.js';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';
import { PrismaService } from '../infra/prisma.service.js';
import { REDIS } from '../infra/redis.provider.js';
import { CmsError, verifyCms } from './cms.js';
import { parseDeviceResponse } from './device-response.js';

const handoff = z.object({
  userId: z.string().min(1),
  deviceId: z.string().min(1),
  next: z.string(),
});
type Handoff = z.infer<typeof handoff>;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class EnrollService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly sessions: SessionService,
  ) {}

  private location(key: 't' | 'error', value: string): string {
    const url = new URL('/enroll/done', this.config.siteUrl);
    url.searchParams.set(key, value);
    return url.href;
  }

  async callback(nonce: unknown, raw: unknown): Promise<string> {
    if (typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(nonce))
      return this.location('error', ErrorCode.ENROLLMENT_INVALID);
    try {
      const pending = await this.prisma.client.enrollmentSession.findUnique({ where: { nonce } });
      if (!pending) throw new DomainError(ErrorCode.ENROLLMENT_INVALID, 400);
      if (pending.status !== 'pending' || pending.expiresAt.getTime() <= Date.now())
        throw new DomainError(ErrorCode.ENROLLMENT_EXPIRED, 400);
      let fields: ReturnType<typeof parseDeviceResponse>;
      try {
        if (!Buffer.isBuffer(raw) || raw.length > 65536) throw new CmsError();
        const pem = await readFile(this.config.enrollment.anchorsPath, 'utf8');
        const anchors = [
          ...pem.matchAll(
            /-----BEGIN CERTIFICATE-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END CERTIFICATE-----/g,
          ),
        ].map((match) =>
          Certificate.fromBER(Buffer.from(match[1]?.replace(/\s/g, '') ?? '', 'base64')),
        );
        const verified = await verifyCms(raw, { anchors, purpose: 'apple-device' });
        fields = parseDeviceResponse(verified.content);
        if (fields.challenge !== nonce) throw new CmsError();
      } catch {
        throw new DomainError(ErrorCode.ENROLLMENT_INVALID, 400);
      }
      let result: Handoff | undefined;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          result = await this.prisma.client.$transaction(
            async (tx) => {
              const claimed = await tx.enrollmentSession.updateMany({
                where: { nonce, status: 'pending', expiresAt: { gt: new Date() } },
                data: { status: 'completed' },
              });
              if (!claimed.count) throw new DomainError(ErrorCode.ENROLLMENT_EXPIRED, 400);
              let device = await tx.device.findUnique({ where: { udid: fields.udid } });
              if (device && pending.userId && pending.userId !== device.userId)
                throw new DomainError(ErrorCode.DEVICE_OWNED, 409);
              let user = device
                ? await tx.user.findUnique({ where: { id: device.userId } })
                : pending.userId
                  ? await tx.user.findUnique({ where: { id: pending.userId } })
                  : null;
              if (user?.blockedAt) throw new DomainError(ErrorCode.ACCOUNT_BLOCKED, 403);
              if (pending.userId && !user) throw new DomainError(ErrorCode.ENROLLMENT_INVALID, 400);
              if (!user) user = await tx.user.create({ data: {} });
              if (!device)
                device = await tx.device.create({
                  data: {
                    userId: user.id,
                    udid: fields.udid,
                    product: fields.product,
                    iosVersion: fields.version,
                    name: deviceModelName(fields.product),
                  },
                });
              await tx.enrollmentSession.update({
                where: { nonce },
                data: { deviceId: device.id },
              });
              return { userId: user.id, deviceId: device.id, next: pending.next ?? '/devices' };
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          );
          break;
        } catch (err) {
          if (
            attempt < 4 &&
            err instanceof Prisma.PrismaClientKnownRequestError &&
            ['P2034', 'P2002'].includes(err.code)
          )
            continue;
          throw err;
        }
      }
      if (!result) throw new DomainError(ErrorCode.INTERNAL, 500);
      const token = randomBytes(32).toString('base64url');
      await this.redis.set(`enroll:done:${hash(token)}`, JSON.stringify(result), 'EX', 300);
      return this.location('t', token);
    } catch (err) {
      const code = err instanceof DomainError ? err.code : ErrorCode.INTERNAL;
      // A replay must not downgrade a previously successful enrollment.
      await this.prisma.client.enrollmentSession
        .updateMany({
          where: { nonce, status: 'pending' },
          data: { status: code === ErrorCode.ENROLLMENT_EXPIRED ? 'expired' : 'failed' },
        })
        .catch(() => undefined);
      return this.location('error', code);
    }
  }

  async complete(token: string, meta: SessionMeta) {
    const raw = await this.redis.getdel(`enroll:done:${hash(token)}`);
    if (!raw) throw new DomainError(ErrorCode.ENROLLMENT_EXPIRED, 400);
    const data = handoff.parse(JSON.parse(raw));
    const user = await this.prisma.client.user.findUnique({ where: { id: data.userId } });
    if (!user || user.blockedAt) throw new DomainError(ErrorCode.ACCOUNT_BLOCKED, 403);
    const device = await this.prisma.client.device.findUnique({ where: { id: data.deviceId } });
    if (!device || device.userId !== user.id)
      throw new DomainError(ErrorCode.ENROLLMENT_INVALID, 400);
    const session = await this.sessions.create(user.id, 'user', { ...meta, deviceId: device.id });
    return { ...session, next: data.next };
  }
}
