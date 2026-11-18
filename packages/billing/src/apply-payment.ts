import { Prisma, type PrismaClient } from '@xstore/db';
import { nextWindow, planViewSchema } from '@xstore/shared';
import type { PaymentProvider } from './provider.js';

export type ApplyPaymentSource = {
  kind: 'webhook' | 'reconcile' | 'return';
  eventKey?: string;
  payload?: unknown;
};

export type ApplyPaymentResult = {
  result: 'granted' | 'already' | 'pending' | 'failed' | 'mismatch' | 'unknown_order';
  orderId?: string;
  accessUntil?: Date;
};

const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

/**
 * Re-reads the payment at the provider and applies it to the order exactly once. Writes happen in
 * one transaction under an advisory lock on the subscription, so concurrent webhooks, reconcile
 * runs and browser returns serialize and only the first one grants rights.
 */
export async function applyPayment(
  db: PrismaClient,
  provider: PaymentProvider,
  providerPaymentId: string,
  source: ApplyPaymentSource,
): Promise<ApplyPaymentResult> {
  const found = await db.order.findUnique({
    where: { providerPaymentId },
    select: { id: true, subscriptionId: true },
  });
  if (!found) return { result: 'unknown_order' };

  // Network call outside the transaction: it must not hold the lock or a connection.
  const payment = await provider.getPayment(providerPaymentId);

  try {
    return await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${found.subscriptionId}))`;

      if (source.eventKey) {
        const seen = await tx.paymentEvent.findUnique({ where: { eventKey: source.eventKey } });
        if (seen) return already(tx, found.id);
      }

      const order = await tx.order.findUniqueOrThrow({ where: { id: found.id } });
      const record = async (result: ApplyPaymentResult): Promise<ApplyPaymentResult> => {
        if (source.eventKey) {
          await tx.paymentEvent.create({
            data: {
              provider: provider.name,
              eventKey: source.eventKey,
              payload: (source.payload ?? {}) as Prisma.InputJsonValue,
              result: result.result,
              processedAt: new Date(),
            },
          });
        }
        return result;
      };

      if (order.status === 'paid' || order.status === 'refunded' || order.paidAt) {
        return record(await already(tx, order.id));
      }
      if (payment.amountRub !== order.amountRub || payment.currency !== 'RUB') {
        return record({ result: 'mismatch', orderId: order.id });
      }
      if (payment.status === 'pending') {
        return record({ result: 'pending', orderId: order.id });
      }
      if (payment.status === 'failed') {
        if (order.status === 'created' || order.status === 'pending') {
          await tx.order.update({ where: { id: order.id }, data: { status: 'failed' } });
        }
        return record({ result: 'failed', orderId: order.id });
      }

      const plan = planViewSchema.parse(order.planSnapshot);
      const paidAt = payment.paidAt ?? new Date();
      const existing = await tx.entitlement.findMany({
        where: { subscriptionId: order.subscriptionId },
        select: { startsAt: true, expiresAt: true, revokedAt: true },
      });
      const window = nextWindow(existing, plan.durationDays, paidAt);
      await tx.entitlement.create({
        data: {
          subscriptionId: order.subscriptionId,
          planCode: plan.code,
          durationDays: plan.durationDays,
          startsAt: window.startsAt,
          expiresAt: window.expiresAt,
          orderId: order.id,
        },
      });
      await tx.order.update({ where: { id: order.id }, data: { status: 'paid', paidAt } });
      return record({ result: 'granted', orderId: order.id, accessUntil: window.expiresAt });
    }, TX_OPTIONS);
  } catch (e) {
    // The same eventKey was recorded concurrently for another order (keys are globally unique).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return already(db, found.id);
    }
    throw e;
  }
}

type Reader = Pick<PrismaClient, 'entitlement'>;

async function already(db: Reader, orderId: string): Promise<ApplyPaymentResult> {
  const e = await db.entitlement.findUnique({ where: { orderId }, select: { expiresAt: true } });
  return e
    ? { result: 'already', orderId, accessUntil: e.expiresAt }
    : { result: 'already', orderId };
}
