import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type ApplyPaymentResult,
  type ApplyPaymentSource,
  applyPayment,
  type PaymentProvider,
} from '@xstore/billing';
import type { Order } from '@xstore/db';
import {
  type AccessState,
  accessState,
  accessUntil,
  type CheckoutRequest,
  ErrorCode,
  type OrderView,
  type PlanSnapshot,
  type PlanView,
  safeNext,
} from '@xstore/shared';
import { SessionService } from '../auth/session.service.js';
import { DomainError } from '../common/domain-error.js';
import type { AuthContext } from '../common/http.js';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';
import { PrismaService } from '../infra/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { PAYMENT_PROVIDER } from './provider.provider.js';

/** An unpaid order lives 24 hours; while it does, no second payment is created. */
const ORDER_TTL_MS = 24 * 60 * 60 * 1000;
const OPEN_STATUSES = ['created', 'pending'] as const;
const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

/** JSON form of `AccessState`: dates as ISO strings. */
export type AccessStateJson =
  | Exclude<AccessState, { kind: 'active' }>
  | (Omit<Extract<AccessState, { kind: 'active' }>, 'until'> & { until: string });

export type AccessJson =
  | { state: { kind: 'none' } }
  | { state: AccessStateJson; email: string | null; hasPassword: boolean };

/** The buyer behind a session; staff sessions never buy. */
function buyerId(auth: AuthContext | null | undefined): string | null {
  return auth && auth.kind === 'user' && auth.role === 'user' ? auth.userId : null;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  private readonly site: string;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
  ) {
    this.site = new URL(config.siteUrl).origin;
  }

  get providerName(): string {
    return this.provider.name;
  }

  /** The interface sells one plan: the first active one. */
  private async activePlan() {
    const plan = await this.prisma.client.plan.findFirst({
      where: { active: true },
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    });
    if (!plan) throw new DomainError(ErrorCode.PLAN_UNAVAILABLE, 404);
    return plan;
  }

  async plan(): Promise<PlanView> {
    const { code, title, durationDays, priceRub } = await this.activePlan();
    return { code, title, durationDays, priceRub };
  }

  /**
   * Finds or creates the order for this checkout. A guest gets a separate provisional buyer:
   * the entered email is a contact, never a credential. Runs under a lock on `checkoutKey`, so a
   * double submit creates one order; a repeat without the first request's session gets 409.
   */
  async openOrder(
    input: CheckoutRequest,
    auth: AuthContext | null | undefined,
  ): Promise<{ order: Order; guestUserId: string | null }> {
    const buyer = buyerId(auth);
    if (auth && !buyer) throw new DomainError(ErrorCode.FORBIDDEN, 403);
    const plan = await this.activePlan();
    const snapshot: PlanSnapshot = {
      code: plan.code,
      title: plan.title,
      durationDays: plan.durationDays,
      priceRub: plan.priceRub,
    };
    const returnTo = input.returnTo ? safeNext(input.returnTo, '') || null : null;

    return this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.checkoutKey}))`;
      const same = await tx.order.findUnique({ where: { checkoutKey: input.checkoutKey } });
      if (same) {
        if (buyer && same.userId === buyer) return { order: same, guestUserId: null };
        throw new DomainError(ErrorCode.CHECKOUT_IN_PROGRESS, 409);
      }

      let userId: string;
      let subscriptionId: string;
      if (buyer) {
        // One checkout per buyer at a time: no second payment while one is unresolved.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`checkout:${buyer}`}))`;
        const subscription =
          (await tx.subscription.findFirst({
            where: { userId: buyer },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
          })) ?? (await tx.subscription.create({ data: { userId: buyer }, select: { id: true } }));
        const open = await tx.order.findFirst({
          where: {
            subscriptionId: subscription.id,
            status: { in: [...OPEN_STATUSES] },
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (open) return { order: open, guestUserId: null };
        userId = buyer;
        subscriptionId = subscription.id;
      } else {
        const user = await tx.user.create({
          data: { isProvisional: true, checkoutEmail: input.email, role: 'user' },
          select: { id: true },
        });
        const subscription = await tx.subscription.create({
          data: { userId: user.id },
          select: { id: true },
        });
        userId = user.id;
        subscriptionId = subscription.id;
      }

      const createdAt = new Date();
      const order = await tx.order.create({
        data: {
          userId,
          subscriptionId,
          planId: plan.id,
          planSnapshot: snapshot,
          checkoutEmail: input.email,
          checkoutKey: input.checkoutKey,
          returnTo,
          // Always the server-side price of the active plan; client amounts are ignored.
          amountRub: plan.priceRub,
          status: 'created',
          provider: this.provider.name,
          createdAt,
          expiresAt: new Date(createdAt.getTime() + ORDER_TTL_MS),
        },
      });
      return { order, guestUserId: buyer ? null : userId };
    }, TX_OPTIONS);
  }

  /**
   * Returns where to send the buyer. A `created` order gets its payment here; the order id is
   * the provider's idempotency key, so a retry after a crash or a race reuses the same payment.
   */
  async paymentRedirect(order: Order): Promise<string> {
    if (order.status === 'pending' && order.redirectUrl) return order.redirectUrl;
    if (order.status !== 'created') return `${this.site}/get/${order.id}`;
    const snapshot = order.planSnapshot as PlanSnapshot;
    let payment: { providerPaymentId: string; redirectUrl: string };
    try {
      payment = await this.provider.createPayment({
        orderId: order.id,
        amountRub: order.amountRub,
        description: snapshot.title,
        returnUrl: `${this.site}/get/${order.id}`,
        idempotencyKey: order.id,
      });
    } catch (err) {
      this.logger.error({ orderId: order.id, err: (err as Error).message }, 'createPayment failed');
      throw new DomainError(ErrorCode.PAYMENT_PROVIDER_DOWN, 503);
    }
    await this.prisma.client.order.updateMany({
      where: { id: order.id, status: 'created' },
      data: {
        status: 'pending',
        providerPaymentId: payment.providerPaymentId,
        redirectUrl: payment.redirectUrl,
      },
    });
    return payment.redirectUrl;
  }

  async createGuestSession(userId: string, meta: { ip?: string; userAgent?: string }) {
    return this.sessions.create(userId, 'user', meta);
  }

  async orderView(id: string, auth: AuthContext | null | undefined): Promise<OrderView> {
    const buyer = buyerId(auth);
    const where = { id, userId: buyer ?? '' };
    let order = buyer ? await this.prisma.client.order.findFirst({ where }) : null;
    if (!order) throw new DomainError(ErrorCode.NOT_FOUND, 404);
    if (order.status === 'pending' && order.providerPaymentId) {
      // The browser came back from the payment page: re-check at the provider. The return
      // itself proves nothing; only the provider's status grants access.
      try {
        await this.processPayment(order.providerPaymentId, { kind: 'return' });
        order = await this.prisma.client.order.findFirstOrThrow({ where });
      } catch (err) {
        this.logger.warn({ orderId: order.id, err: (err as Error).message }, 'return check failed');
      }
    }
    let until: Date | null = null;
    if (order.status === 'paid') {
      const rights = await this.prisma.client.entitlement.findMany({
        where: { subscriptionId: order.subscriptionId },
        select: { startsAt: true, expiresAt: true, revokedAt: true },
      });
      until = accessUntil(rights, new Date());
    }
    return {
      id: order.id,
      status: order.status,
      amountRub: order.amountRub,
      paidAt: order.paidAt?.toISOString() ?? null,
      returnTo: order.returnTo,
      accessUntil: until?.toISOString() ?? null,
    };
  }

  async access(auth: AuthContext | null | undefined): Promise<AccessJson> {
    const buyer = buyerId(auth);
    if (!buyer) return { state: { kind: 'none' } };
    const now = new Date();
    const user = await this.prisma.client.user.findUnique({
      where: { id: buyer },
      select: {
        email: true,
        checkoutEmail: true,
        passwordHash: true,
        subscriptions: {
          select: {
            id: true,
            deviceId: true,
            entitlements: { select: { startsAt: true, expiresAt: true, revokedAt: true } },
          },
        },
      },
    });
    if (!user) return { state: { kind: 'none' } };
    const pending = await this.prisma.client.order.findFirst({
      where: { userId: buyer, status: { in: [...OPEN_STATUSES] }, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const state = accessState({
      signedIn: true,
      subscriptions: user.subscriptions.map((s) => ({
        id: s.id,
        rights: s.entitlements,
        deviceReady: s.deviceId !== null,
      })),
      pendingOrderId: pending?.id ?? null,
      now,
    });
    return {
      state: state.kind === 'active' ? { ...state, until: state.until.toISOString() } : state,
      // A provisional buyer has no verified email; show the contact they paid with.
      email: user.email ?? user.checkoutEmail,
      hasPassword: user.passwordHash !== null,
    };
  }

  /**
   * The single path that applies a provider payment: webhooks, browser returns and the dev
   * buttons all come through here.
   */
  async processPayment(
    providerPaymentId: string,
    source: ApplyPaymentSource,
  ): Promise<ApplyPaymentResult> {
    const result = await applyPayment(this.prisma.client, this.provider, providerPaymentId, source);
    if (result.result === 'granted' && result.orderId) await this.afterGranted(result.orderId);
    return result;
  }

  /**
   * Follow-ups of a grant. The payment is already applied, so their errors are logged and never
   * fail the webhook: a retry would find the order paid and not run them again.
   */
  private async afterGranted(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.client.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { userId: true },
      });
      await this.sessions.extendUserSessions(order.userId);
    } catch (err) {
      this.logger.error({ orderId, err: (err as Error).message }, 'session extension failed');
    }
    try {
      await this.mail.paymentPaid(orderId);
    } catch (err) {
      this.logger.error({ orderId, err: (err as Error).message }, 'payment_paid mail failed');
    }
  }
}
