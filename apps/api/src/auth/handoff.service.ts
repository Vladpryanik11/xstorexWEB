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
    const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS);
    await this.prisma.client.loginHandoff.create({
      data: { tokenHash: hashToken(token), userId, expiresAt },
    });
    return { token, expiresAt };
  }

  /**
   * A new session of the link's buyer, or null when this browser is already signed in as that
   * buyer (a reload where the link was made): then the link is not spent.
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
    if (handoff.userId === currentUserId) return null;
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
