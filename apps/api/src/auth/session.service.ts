import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { SessionKind } from '@xstore/db';
import { accessUntil, userSessionExpiry } from '@xstore/shared';
import type { AuthContext } from '../common/http.js';
import { PrismaService } from '../infra/prisma.service.js';

/** Staff sessions have a fixed lifetime; buyer sessions follow paid access (`userExpiry`). */
const STAFF_TTL_MS = 12 * 60 * 60 * 1000;
/** lastSeenAt is refreshed at most this often to keep reads cheap. */
const TOUCH_MS = 5 * 60 * 1000;
const RENEW_BELOW_MS = 15 * 24 * 60 * 60 * 1000;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export type SessionMeta = { ip?: string; userAgent?: string };

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    kind: SessionKind,
    meta: SessionMeta,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt =
      kind === 'user' ? await this.userExpiry(userId) : new Date(Date.now() + STAFF_TTL_MS);
    await this.prisma.client.session.create({
      data: {
        id: hashToken(token),
        userId,
        kind,
        expiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 512),
      },
    });
    return { token, expiresAt };
  }

  async resolve(token: string): Promise<AuthContext | null> {
    if (!TOKEN.test(token)) return null;
    const id = hashToken(token);
    const session = await this.prisma.client.session.findUnique({
      where: { id },
      include: { user: { select: { role: true, blockedAt: true } } },
    });
    if (!session) return null;
    const now = Date.now();
    if (session.expiresAt.getTime() <= now) {
      await this.prisma.client.session.deleteMany({ where: { id } });
      return null;
    }
    if (session.user.blockedAt) return null;
    const shouldRenew =
      session.kind === 'user' && session.expiresAt.getTime() - now < RENEW_BELOW_MS;
    const shouldTouch = now - session.lastSeenAt.getTime() > TOUCH_MS;
    let expiresAt = session.expiresAt;
    if (shouldRenew || shouldTouch) {
      const data: { lastSeenAt: Date; expiresAt?: Date } = { lastSeenAt: new Date(now) };
      if (shouldRenew) {
        expiresAt = await this.userExpiry(session.userId, new Date(now));
        data.expiresAt = expiresAt;
      }
      const updated = await this.prisma.client.session.updateMany({
        where: { id, expiresAt: { gt: new Date(now) } },
        data,
      });
      // A concurrent logout or revocation wins over a request already in flight.
      if (updated.count === 0) return null;
    }
    return {
      userId: session.userId,
      role: session.user.role,
      sessionId: id,
      kind: session.kind,
      deviceId: session.deviceId,
      expiresAt,
      renewed: shouldRenew,
    };
  }

  /** `max(now + 30 days, end of paid access + 7 days)` over all the user's subscriptions. */
  async userExpiry(userId: string, now = new Date()): Promise<Date> {
    const rights = await this.prisma.client.entitlement.findMany({
      where: { subscription: { userId } },
      select: { startsAt: true, expiresAt: true, revokedAt: true },
    });
    return userSessionExpiry(now, accessUntil(rights, now));
  }

  /**
   * After a payment: moves every live buyer session of the user up to the new expiry. Never
   * shortens a session and never revives an expired one.
   */
  async extendUserSessions(userId: string): Promise<void> {
    const now = new Date();
    const expiresAt = await this.userExpiry(userId, now);
    await this.prisma.client.session.updateMany({
      where: { userId, kind: 'user', expiresAt: { gt: now, lt: expiresAt } },
      data: { expiresAt },
    });
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.client.session.deleteMany({ where: { id: sessionId } });
  }
}
