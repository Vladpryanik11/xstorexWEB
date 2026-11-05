import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode, type StaffLogin } from '@xstore/shared';
import { Redis } from 'ioredis';
import { AuditService } from '../audit/audit.service.js';
import { DomainError } from '../common/domain-error.js';
import { PrismaService } from '../infra/prisma.service.js';
import { REDIS, redisReady } from '../infra/redis.provider.js';
import { hashPassword, verifyPassword } from './password.js';
import { type SessionMeta, SessionService } from './session.service.js';
import { verifyTotp } from './totp.js';

const STAFF_ROLES = new Set(['admin', 'support']);
/** Longer than the ±1 step window (3 × 30 s), so a code cannot be reused while it is valid. */
const TOTP_REPLAY_TTL_SEC = 90;

@Injectable()
export class StaffAuthService {
  /** Verified when the email is unknown, so both failures take about the same time. */
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async login(input: StaffLogin, meta: SessionMeta): Promise<{ token: string; expiresAt: Date }> {
    const user = await this.prisma.client.user.findUnique({ where: { email: input.email } });
    this.dummyHash ??= hashPassword('xstore-dummy-password');
    const passwordOk = await verifyPassword(
      user?.passwordHash ?? (await this.dummyHash),
      input.password,
    );
    const eligible =
      user !== null &&
      STAFF_ROLES.has(user.role) &&
      user.blockedAt === null &&
      user.passwordHash !== null &&
      user.totpSecret !== null;

    const step =
      eligible && passwordOk && user.totpSecret
        ? verifyTotp(user.totpSecret, input.totp, new Date())
        : null;
    const fresh = user && step !== null ? await this.claimTotpStep(user.id, step) : false;
    if (!user || !fresh) {
      await this.audit.record({
        actorId: user?.id,
        action: 'auth.staff.login_failed',
        entity: 'User',
        entityId: user?.id,
        diff: { email: input.email },
        ip: meta.ip,
      });
      throw new DomainError(ErrorCode.INVALID_CREDENTIALS, 401);
    }

    const session = await this.sessions.create(user.id, 'staff', meta);
    await this.audit.record({
      actorId: user.id,
      action: 'auth.staff.login',
      entity: 'User',
      entityId: user.id,
      ip: meta.ip,
    });
    return session;
  }

  /** Marks a TOTP step as used; false when it was already used (replay). */
  private async claimTotpStep(userId: string, step: number): Promise<boolean> {
    const redis = await redisReady(this.redis);
    const ok = await redis.set(`totp:used:${userId}:${step}`, '1', 'EX', TOTP_REPLAY_TTL_SEC, 'NX');
    return ok === 'OK';
  }
}
