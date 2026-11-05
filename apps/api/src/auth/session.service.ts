import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { SessionKind } from '@xstore/db';
import type { AuthContext } from '../common/http.js';
import { PrismaService } from '../infra/prisma.service.js';

const TTL_MS: Record<SessionKind, number> = {
  staff: 12 * 60 * 60 * 1000,
  user: 30 * 24 * 60 * 60 * 1000,
};
/** lastSeenAt is refreshed at most this often to keep reads cheap. */
const TOUCH_MS = 5 * 60 * 1000;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export type SessionMeta = { ip?: string; userAgent?: string; deviceId?: string };

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
    const expiresAt = new Date(Date.now() + TTL_MS[kind]);
    await this.prisma.client.session.create({
      data: {
        id: hashToken(token),
        userId,
        kind,
        expiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 512),
        deviceId: meta.deviceId,
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
    if (now - session.lastSeenAt.getTime() > TOUCH_MS) {
      await this.prisma.client.session.update({
        where: { id },
        data: { lastSeenAt: new Date(now) },
      });
    }
    return { userId: session.userId, role: session.user.role, sessionId: id, kind: session.kind };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.client.session.deleteMany({ where: { id: sessionId } });
  }
}
