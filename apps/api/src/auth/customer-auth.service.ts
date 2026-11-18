import { Injectable } from '@nestjs/common';
import {
  type CustomerLogin,
  type EmailCodeVerify,
  ErrorCode,
  isAcceptablePassword,
} from '@xstore/shared';
import { DomainError } from '../common/domain-error.js';
import { PrismaService } from '../infra/prisma.service.js';
import { claimProvisional } from './claim-provisional.js';
import { EmailCodeService } from './email-code.service.js';
import { dummyPasswordHash, hashPassword, verifyPassword } from './password.js';
import { type SessionMeta, SessionService } from './session.service.js';

/** At most this many paid provisional accounts of one email are tried, newest payment first. */
const MAX_PROVISIONAL_CANDIDATES = 5;
const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

type NewSession = { token: string; expiresAt: Date };

/**
 * Buyer sign-in. A verified buyer (`email` set) signs in by password or by a code to the email;
 * a provisional buyer (paid as a guest, `checkoutEmail` only) by the password set after payment.
 * A code login is the proof of the email: it claims the provisional purchases of that address.
 */
@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly codes: EmailCodeService,
  ) {}

  async login(input: CustomerLogin, meta: SessionMeta): Promise<NewSession> {
    const open = { role: 'user', blockedAt: null, passwordHash: { not: null } } as const;
    const verified = await this.prisma.client.user.findFirst({
      where: { ...open, email: input.email, isProvisional: false },
      select: { id: true, passwordHash: true },
    });
    // Only provisional accounts with a paid order: free unpaid ones cannot crowd out a real one.
    const paidProvisional = await this.prisma.client.user.findMany({
      where: {
        ...open,
        isProvisional: true,
        checkoutEmail: input.email,
        orders: { some: { status: 'paid' } },
      },
      select: {
        id: true,
        passwordHash: true,
        orders: {
          where: { status: 'paid' },
          select: { paidAt: true },
          orderBy: { paidAt: 'desc' },
          take: 1,
        },
      },
    });
    const lastPaid = (u: (typeof paidProvisional)[number]) => u.orders[0]?.paidAt?.getTime() ?? 0;
    const provisional = paidProvisional
      .sort((a, b) => lastPaid(b) - lastPaid(a) || (a.id < b.id ? 1 : -1))
      .slice(0, MAX_PROVISIONAL_CANDIDATES);
    const candidates = verified ? [verified, ...provisional] : provisional;
    if (candidates.length === 0) {
      await verifyPassword(await dummyPasswordHash(), input.password);
      throw new DomainError(ErrorCode.INVALID_CREDENTIALS, 401);
    }
    for (const c of candidates) {
      if (c.passwordHash && (await verifyPassword(c.passwordHash, input.password))) {
        return this.sessions.create(c.id, 'user', meta);
      }
    }
    throw new DomainError(ErrorCode.INVALID_CREDENTIALS, 401);
  }

  /** Mails a code; `retryAfterSec` when this email is asking too soon or too often. */
  requestCode(email: string): Promise<{ retryAfterSec: number } | null> {
    return this.codes.issue(email);
  }

  /**
   * Proves the email by its code, finds or creates the verified buyer for it, claims the
   * provisional purchases of that email (their sessions are revoked there) and signs in.
   */
  async verifyCode(input: EmailCodeVerify, meta: SessionMeta): Promise<NewSession> {
    if (!(await this.codes.consume(input.email, input.code))) {
      throw new DomainError(ErrorCode.CODE_INVALID, 400);
    }
    const userId = await this.prisma.client.$transaction(async (tx) => {
      // The same lock claimProvisional takes (re-entrant): find-or-create and claim are one step.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.email}))`;
      const existing = await tx.user.findUnique({
        where: { email: input.email },
        select: { id: true, role: true, isProvisional: true, blockedAt: true },
      });
      if (existing && (existing.role !== 'user' || existing.isProvisional)) {
        // A staff address never becomes a buyer session.
        throw new DomainError(ErrorCode.FORBIDDEN, 403);
      }
      if (existing?.blockedAt) throw new DomainError(ErrorCode.ACCOUNT_BLOCKED, 403);
      const user =
        existing ??
        (await tx.user.create({
          data: { email: input.email, role: 'user' },
          select: { id: true },
        }));
      await claimProvisional(tx, user.id, input.email);
      return user.id;
    }, TX_OPTIONS);
    // Created after the claim, so its lifetime covers the access it just received.
    return this.sessions.create(userId, 'user', meta);
  }

  /**
   * Sets the buyer's password (8–128 characters) and signs out their other sessions. Recovery is
   * a code login followed by this.
   */
  async setPassword(userId: string, password: string, currentSessionId: string): Promise<void> {
    if (!isAcceptablePassword(password)) throw new DomainError(ErrorCode.WEAK_PASSWORD, 400);
    const passwordHash = await hashPassword(password);
    await this.prisma.client.$transaction([
      this.prisma.client.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.client.session.deleteMany({
        where: { userId, id: { not: currentSessionId } },
      }),
    ]);
  }
}
