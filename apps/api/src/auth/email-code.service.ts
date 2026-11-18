import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { PrismaService } from '../infra/prisma.service.js';
import { REDIS, redisReady } from '../infra/redis.provider.js';
import { MailService } from '../mail/mail.service.js';
import { RateLimiter } from '../rate-limit/rate-limiter.js';

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_AFTER_SEC = 60;
/** Codes per email per window (the per-IP limit is on the route). */
const PER_EMAIL = { limit: 3, windowSec: 10 * 60 };
/** Five wrong attempts are tolerated; the sixth wrong one uses up the code. */
const MAX_ATTEMPTS = 6;

/** SHA-256 of the email and code: the code itself is never stored. */
export function hashCode(email: string, code: string): string {
  return createHash('sha256').update(`${email}:${code}`).digest('hex');
}

/** Six-digit codes for buyer sign-in by email. The code is never stored or logged. */
@Injectable()
export class EmailCodeService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly limiter: RateLimiter,
    private readonly mail: MailService,
  ) {}

  /**
   * Issues a new code and mails it, whether or not anyone uses this email. The new code replaces
   * any earlier one. Returns `retryAfterSec` instead when the email is resending too soon or too
   * often; that answer is the same for every email.
   */
  async issue(email: string): Promise<{ retryAfterSec: number } | null> {
    const redis = await redisReady(this.redis);
    const cooldown = `code:cooldown:${email}`;
    if ((await redis.set(cooldown, '1', 'EX', RESEND_AFTER_SEC, 'NX')) !== 'OK') {
      const ttl = await redis.ttl(cooldown);
      return { retryAfterSec: ttl > 0 ? ttl : RESEND_AFTER_SEC };
    }
    const limit = await this.limiter.consume(
      `code-request:email:${email}`,
      PER_EMAIL.limit,
      PER_EMAIL.windowSec,
    );
    if (!limit.allowed) return { retryAfterSec: limit.retryAfterSec };

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const now = new Date();
    await this.prisma.client.$transaction([
      this.prisma.client.emailCode.updateMany({
        where: { email, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.client.emailCode.create({
        data: {
          email,
          codeHash: hashCode(email, code),
          createdAt: now,
          expiresAt: new Date(now.getTime() + CODE_TTL_MS),
        },
      }),
    ]);
    await this.mail.send('login_code', email, { code });
    return null;
  }

  /**
   * True once for the right code of the email's live code. Every attempt is counted before the
   * comparison with a conditional update, so parallel guesses cannot exceed the limit.
   */
  async consume(email: string, code: string): Promise<boolean> {
    const now = new Date();
    const live = await this.prisma.client.emailCode.findFirst({
      where: { email, usedAt: null, expiresAt: { gt: now } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, codeHash: true },
    });
    if (!live) return false;
    const reserved = await this.prisma.client.emailCode.updateMany({
      where: { id: live.id, usedAt: null, expiresAt: { gt: now }, attempts: { lt: MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (reserved.count === 0) return false;
    const expected = Buffer.from(live.codeHash, 'hex');
    const actual = Buffer.from(hashCode(email, code), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
    const used = await this.prisma.client.emailCode.updateMany({
      where: { id: live.id, usedAt: null },
      data: { usedAt: now },
    });
    return used.count === 1;
  }
}
