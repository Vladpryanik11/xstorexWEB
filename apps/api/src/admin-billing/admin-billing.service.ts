import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@xstore/db';
import {
  type AdminOrder,
  type AdminOrdersQuery,
  type AdminPlan,
  type AdminSubscription,
  type AdminSubscriptionsQuery,
  accessUntil,
  DEFAULT_PLAN,
  ErrorCode,
  type GrantRequest,
  type GrantResult,
  nextWindow,
  type Page,
  type UpdatePlan,
} from '@xstore/shared';
import { z } from 'zod';
import { SessionService } from '../auth/session.service.js';
import { buyerSubscription } from '../billing/buyer-subscription.js';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { PrismaService } from '../infra/prisma.service.js';
import { rechainAfterRefund } from './rechain.js';

export const ADMIN_BILLING_PAGE_SIZE = 50;
/** `Entitlement.planCode` of a right an admin gave by hand. */
export const MANUAL_PLAN_CODE = 'manual';
const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

const invalid = (): DomainError => new DomainError(ErrorCode.VALIDATION, 400);
const iso = (d: Date | null | undefined): string | null => d?.toISOString() ?? null;

/** Keyset cursor over `(createdAt desc, id desc)`. */
const cursorSchema = z.object({ c: z.iso.datetime(), i: z.string().min(1) });

function decodeCursor(raw: string | undefined): { createdAt: Date; id: string } | undefined {
  if (!raw) return undefined;
  try {
    const c = cursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
    return { createdAt: new Date(c.c), id: c.i };
  } catch {
    throw invalid();
  }
}

function encodeCursor(row: { createdAt: Date; id: string } | undefined, more: boolean) {
  if (!row || !more) return null;
  return Buffer.from(JSON.stringify({ c: row.createdAt.toISOString(), i: row.id })).toString(
    'base64url',
  );
}

const after = (cursor: { createdAt: Date; id: string } | undefined) =>
  cursor
    ? {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      }
    : {};

const contains = (q: string) => ({ contains: q, mode: 'insensitive' as const });

const ORDER_SELECT = {
  id: true,
  checkoutEmail: true,
  amountRub: true,
  status: true,
  createdAt: true,
  paidAt: true,
  user: { select: { email: true } },
  entitlement: { select: { startsAt: true, expiresAt: true, revokedAt: true } },
} satisfies Prisma.OrderSelect;

type OrderRow = Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>;

function orderView(o: OrderRow): AdminOrder {
  return {
    id: o.id,
    email: o.checkoutEmail,
    userEmail: o.user.email,
    amountRub: o.amountRub,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    paidAt: iso(o.paidAt),
    accessStartsAt: iso(o.entitlement?.startsAt),
    accessUntil: iso(o.entitlement?.expiresAt),
    revokedAt: iso(o.entitlement?.revokedAt),
  };
}

function changes(before: Record<string, unknown>, patch: Record<string, unknown>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [field, to] of Object.entries(patch)) {
    if (before[field] !== to) out[field] = { from: before[field] ?? null, to };
  }
  return out;
}

/**
 * Admin side of billing: the plan, orders, subscriptions, manual grants and refund marks. Every
 * mutation writes its audit entry in the same transaction as the change.
 *
 * Locks follow the order documented in `claimProvisional`: `hashtext(email)` →
 * `hashtext('checkout:' + userId)` → `hashtext(subscriptionId)`. A grant takes all three in that
 * order; a refund takes only the subscription lock, the one `applyPayment` takes.
 */
@Injectable()
export class AdminBillingService {
  private readonly logger = new Logger(AdminBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  /** The plan the site sells: the same ordering as checkout, active or not. */
  private async currentPlan() {
    return this.db.plan.findFirst({ orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] });
  }

  /** The plan, or a draft of the single `month` plan when none was created yet. */
  async plan(): Promise<AdminPlan> {
    const plan = await this.currentPlan();
    if (!plan) return { id: null, ...DEFAULT_PLAN, priceRub: null, active: false };
    const { id, code, title, durationDays, priceRub, active } = plan;
    return { id, code, title, durationDays, priceRub, active };
  }

  /**
   * Paid orders keep their `planSnapshot` and `amountRub`; only new checkouts see the change.
   * Without a plan the first save creates the single `month` plan: it needs a price and stays off
   * sale unless `active` is given. Concurrent first saves create one plan.
   */
  async updatePlan(patch: UpdatePlan, actor: Actor): Promise<AdminPlan> {
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('plan:create'))`;
      const current = await tx.plan.findFirst({
        orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      });
      if (!current) {
        if (patch.priceRub === undefined) {
          throw new DomainError(ErrorCode.PLAN_PRICE_REQUIRED, 400);
        }
        const data = {
          ...DEFAULT_PLAN,
          title: patch.title ?? DEFAULT_PLAN.title,
          priceRub: patch.priceRub,
          active: patch.active ?? false,
        };
        const created = await tx.plan.create({ data });
        await tx.auditLog.create({
          data: {
            actorId: actor.userId,
            action: 'plan.create',
            entity: 'plan',
            entityId: created.id,
            diff: data,
            ip: actor.ip,
          },
        });
        return;
      }
      const { id } = current;
      // Row lock: concurrent edits serialize, so each audit `from` is the value it replaced.
      await tx.$queryRaw`SELECT id FROM "Plan" WHERE id = ${id} FOR UPDATE`;
      const plan = await tx.plan.findUniqueOrThrow({ where: { id } });
      const diff = changes(plan, patch);
      if (Object.keys(diff).length === 0) return;
      await tx.plan.update({ where: { id }, data: patch });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: 'plan.update',
          entity: 'plan',
          entityId: id,
          diff: diff as Prisma.InputJsonValue,
          ip: actor.ip,
        },
      });
    }, TX_OPTIONS);
    return this.plan();
  }

  async orders(query: AdminOrdersQuery): Promise<Page<AdminOrder>> {
    const cursor = decodeCursor(query.cursor);
    const where: Prisma.OrderWhereInput = {
      ...(query.status && { status: query.status }),
      AND: [
        query.email
          ? {
              OR: [
                { checkoutEmail: contains(query.email) },
                { user: { email: contains(query.email) } },
              ],
            }
          : {},
        after(cursor),
      ],
    };
    const rows = await this.db.order.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ADMIN_BILLING_PAGE_SIZE + 1,
      select: ORDER_SELECT,
    });
    const page = rows.slice(0, ADMIN_BILLING_PAGE_SIZE);
    return {
      items: page.map(orderView),
      nextCursor: encodeCursor(page.at(-1), rows.length > ADMIN_BILLING_PAGE_SIZE),
    };
  }

  async subscriptions(query: AdminSubscriptionsQuery): Promise<Page<AdminSubscription>> {
    const cursor = decodeCursor(query.cursor);
    const q = query.email;
    const where: Prisma.SubscriptionWhereInput = {
      AND: [
        q
          ? {
              OR: [
                { user: { email: contains(q) } },
                { user: { checkoutEmail: contains(q) } },
                { orders: { some: { checkoutEmail: contains(q) } } },
              ],
            }
          : {},
        after(cursor),
      ],
    };
    const rows = await this.db.subscription.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ADMIN_BILLING_PAGE_SIZE + 1,
      select: {
        id: true,
        createdAt: true,
        user: { select: { email: true, checkoutEmail: true, isProvisional: true } },
        device: { select: { id: true, name: true } },
        entitlements: {
          orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            startsAt: true,
            expiresAt: true,
            revokedAt: true,
            orderId: true,
            note: true,
          },
        },
      },
    });
    const now = new Date();
    const page = rows.slice(0, ADMIN_BILLING_PAGE_SIZE);
    return {
      items: page.map((s) => ({
        id: s.id,
        email: s.user.email ?? s.user.checkoutEmail,
        provisional: s.user.isProvisional,
        device: s.device,
        createdAt: s.createdAt.toISOString(),
        accessUntil: iso(accessUntil(s.entitlements, now)),
        rights: s.entitlements.map((r) => ({
          id: r.id,
          startsAt: r.startsAt.toISOString(),
          expiresAt: r.expiresAt.toISOString(),
          revokedAt: iso(r.revokedAt),
          source: r.orderId ? ('order' as const) : ('grant' as const),
          note: r.note,
        })),
      })),
      nextCursor: encodeCursor(page.at(-1), rows.length > ADMIN_BILLING_PAGE_SIZE),
    };
  }

  /**
   * Gives `days` of access to the verified buyer with `email`, created if there is none. It goes
   * to the subscription `/access` shows (`buyerSubscription`) and starts at `max(now, end of its
   * live rights)`, as a renewal would.
   * Provisional buyers who paid with this email are left alone: their purchases merge into the
   * verified buyer at their next code login (`claimProvisional`).
   */
  async grant(input: GrantRequest, actor: Actor): Promise<GrantResult> {
    const result = await this.db.$transaction(async (tx) => {
      // 1. The lock code login and claimProvisional take: find-or-create of this email is one step.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.email}))`;
      const existing = await tx.user.findUnique({
        where: { email: input.email },
        select: { id: true, role: true, isProvisional: true, blockedAt: true },
      });
      if (existing && existing.role !== 'user') {
        throw new DomainError(ErrorCode.GRANT_STAFF_EMAIL, 409);
      }
      // Provisional buyers keep `email = null`; a row like this is inconsistent data, not staff.
      if (existing?.isProvisional) throw new DomainError(ErrorCode.CONFLICT, 409);
      if (existing?.blockedAt) throw new DomainError(ErrorCode.ACCOUNT_BLOCKED, 409);
      const user =
        existing ??
        (await tx.user.create({
          data: { email: input.email, role: 'user' },
          select: { id: true },
        }));

      // 2. The checkout lock: no concurrent openOrder creates a second subscription meanwhile.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`checkout:${user.id}`}))`;
      // The subscription `/access` shows: after a claim the oldest is not always the live one.
      const subscription = await buyerSubscription(tx, user.id);

      // 3. The applyPayment lock: a payment and a grant on one subscription never interleave.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${subscription.id}))`;
      const rights = await tx.entitlement.findMany({
        where: { subscriptionId: subscription.id },
        select: { startsAt: true, expiresAt: true, revokedAt: true },
      });
      const window = nextWindow(rights, input.days, new Date());
      const right = await tx.entitlement.create({
        data: {
          subscriptionId: subscription.id,
          planCode: MANUAL_PLAN_CODE,
          durationDays: input.days,
          startsAt: window.startsAt,
          expiresAt: window.expiresAt,
          grantedById: actor.userId,
          note: input.note || null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: 'grant.create',
          entity: 'entitlement',
          entityId: right.id,
          diff: {
            email: input.email,
            days: input.days,
            note: input.note,
            subscriptionId: subscription.id,
            startsAt: window.startsAt.toISOString(),
            expiresAt: window.expiresAt.toISOString(),
          },
          ip: actor.ip,
        },
      });
      return { userId: user.id, subscriptionId: subscription.id, ...window };
    }, TX_OPTIONS);

    try {
      await this.sessions.extendUserSessions(result.userId);
    } catch (err) {
      this.logger.error({ err: (err as Error).message }, 'session extension after grant failed');
    }
    return {
      subscriptionId: result.subscriptionId,
      startsAt: result.startsAt.toISOString(),
      expiresAt: result.expiresAt.toISOString(),
    };
  }

  /**
   * Marks a refund already made in the provider's dashboard: the order becomes `refunded`, its
   * right is revoked and the later live rights of the subscription are pulled forward without a
   * gap (`rechainAfterRefund`), all under the subscription lock. Moves no money. A repeat answers
   * the refunded order and changes nothing.
   */
  async refund(orderId: string, note: string, actor: Actor): Promise<AdminOrder> {
    const found = await this.db.order.findUnique({
      where: { id: orderId },
      select: { subscriptionId: true },
    });
    if (!found) throw new DomainError(ErrorCode.NOT_FOUND, 404);
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${found.subscriptionId}))`;
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { status: true },
      });
      if (order.status === 'refunded') {
        return orderView(
          await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: ORDER_SELECT }),
        );
      }
      if (order.status !== 'paid') throw new DomainError(ErrorCode.REFUND_NOT_PAID, 409);
      const now = new Date();
      await tx.order.update({ where: { id: orderId }, data: { status: 'refunded' } });
      const refunded = await tx.entitlement.findUnique({
        where: { orderId },
        select: { id: true, startsAt: true, revokedAt: true },
      });
      if (refunded && !refunded.revokedAt) {
        await tx.entitlement.update({ where: { id: refunded.id }, data: { revokedAt: now } });
      }
      const moves = refunded
        ? rechainAfterRefund(
            await tx.entitlement.findMany({
              where: { subscriptionId: found.subscriptionId, revokedAt: null },
              select: { id: true, startsAt: true, expiresAt: true },
            }),
            refunded,
            now,
          )
        : [];
      for (const m of moves) {
        await tx.entitlement.update({ where: { id: m.id }, data: m.to });
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: 'order.refund',
          entity: 'order',
          entityId: orderId,
          diff: {
            status: { from: 'paid', to: 'refunded' },
            revokedEntitlementId: refunded?.id ?? null,
            moved: moves.map((m) => ({
              entitlementId: m.id,
              from: {
                startsAt: m.from.startsAt.toISOString(),
                expiresAt: m.from.expiresAt.toISOString(),
              },
              to: {
                startsAt: m.to.startsAt.toISOString(),
                expiresAt: m.to.expiresAt.toISOString(),
              },
            })),
            note,
          },
          ip: actor.ip,
        },
      });
      return orderView(
        await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: ORDER_SELECT }),
      );
    }, TX_OPTIONS);
  }
}
