import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@xstore/shared';
import { DomainError } from '../common/domain-error.js';
import { PrismaService } from '../infra/prisma.service.js';
import { hashToken, type SessionMeta, SessionService } from './session.service.js';

/** Spec v2 §4 step 2a: the link carries the sign-in for ten minutes, once. */
export const HANDOFF_TTL_MS = 10 * 60 * 1000;

type NewSession = { token: string; expiresAt: Date };

/**
 * One-time sign-in links that move a buyer from an in-app browser (Telegram, Chrome…) into
 * Safari, where the iPhone can be connected. Only the SHA-256 of a token is stored.
 */
@Injectable()
export class HandoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  async issue(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + HANDOFF_TTL_MS);
    // One live link per buyer: a renewed link voids the one before it.
    await this.prisma.client.$transaction([
      this.prisma.client.loginHandoff.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.client.loginHandoff.create({
        data: { tokenHash: hashToken(token), userId, expiresAt },
      }),
    ]);
    return { token, expiresAt };
  }

  /** Logout and a new password end the buyer's unspent links. */
  async voidUnspent(userId: string): Promise<void> {
    await this.prisma.client.loginHandoff.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  /**
   * A new session of the link's buyer, or null when this browser already has a buyer session:
   * the same buyer (a reload where the link was made) or another one, which a link never
   * replaces (someone else's link must not swap the account this browser connects a device to).
   * Then the link is not spent.
   */
  async redeem(
    token: string,
    currentUserId: string | null,
    meta: SessionMeta,
  ): Promise<NewSession | null> {
    const tokenHash = hashToken(token);
    const now = new Date();
    const handoff = await this.prisma.client.loginHandoff.findUnique({
      where: { tokenHash },
      select: { userId: true, expiresAt: true, usedAt: true },
    });
    if (!handoff || handoff.usedAt || handoff.expiresAt <= now) throw invalid();
    if (currentUserId !== null) return null;
    const user = await this.prisma.client.user.findUnique({
      where: { id: handoff.userId },
      select: { role: true, blockedAt: true },
    });
    if (user?.role !== 'user' || user.blockedAt) throw invalid();
    // Spent atomically: two browsers racing with one link get one session.
    const spent = await this.prisma.client.loginHandoff.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (spent.count !== 1) throw invalid();
    return this.sessions.create(handoff.userId, 'user', meta);
  }
}

const invalid = () => new DomainError(ErrorCode.HANDOFF_INVALID, 400);
