import { applyPayment } from '@xstore/billing';
import type { WorkerDeps } from '../deps.js';

export const ORDER_TTL_MS = 24 * 60 * 60 * 1000;
export const BATCH = 200;

export type ExpireOutcome = {
  expired: number;
  granted: number;
  stillPending: number;
  errors: number;
};

/**
 * `billing:expireOrders`: an unpaid order lives 24 hours.
 * - `created` without a provider payment older than that expires directly;
 * - `created`/`pending` with a payment ask the provider: `failed` expires the order, `paid` grants
 *   access (a late success is never dropped), `pending` leaves it alone with a warning, because
 *   the buyer may still pay and a second payment must not appear until the result is known.
 */
export async function expireOrders(
  deps: WorkerDeps,
  now: Date = new Date(),
  batch: number = BATCH,
): Promise<ExpireOutcome> {
  const { db, logger, payments } = deps;
  const outcome: ExpireOutcome = { expired: 0, granted: 0, stillPending: 0, errors: 0 };
  const cutoff = new Date(now.getTime() - ORDER_TTL_MS);

  const direct = await db.order.updateMany({
    where: { status: 'created', providerPaymentId: null, createdAt: { lt: cutoff } },
    data: { status: 'expired' },
  });
  outcome.expired += direct.count;

  if (!payments) {
    logger.warn('billing:expireOrders skipped provider check: adapter is not configured');
    return outcome;
  }
  let cursor: string | undefined;
  for (;;) {
    // Keyset paging: provider-pending orders stay in the filter and must not starve newer ones.
    const orders = await db.order.findMany({
      where: {
        status: { in: ['created', 'pending'] },
        providerPaymentId: { not: null },
        createdAt: { lt: cutoff },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: batch,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, providerPaymentId: true },
    });
    for (const order of orders) {
      const paymentId = order.providerPaymentId;
      if (!paymentId) continue;
      try {
        const payment = await payments.getPayment(paymentId);
        if (payment.status === 'paid') {
          // Reuse the payment just read: one provider call per order.
          const known = { ...payments, getPayment: async () => payment };
          const res = await applyPayment(db, known, paymentId, { kind: 'reconcile' });
          if (res.result === 'granted') outcome.granted += 1;
        } else if (payment.status === 'failed') {
          const { count } = await db.order.updateMany({
            where: { id: order.id, status: { in: ['created', 'pending'] }, paidAt: null },
            data: { status: 'expired' },
          });
          outcome.expired += count;
        } else {
          outcome.stillPending += 1;
          logger.warn(
            { orderId: order.id },
            'billing:expireOrders order is older than 24h but still pending at the provider',
          );
        }
      } catch (err) {
        outcome.errors += 1;
        logger.warn(
          { orderId: order.id, err: err instanceof Error ? err.message : String(err) },
          'billing:expireOrders failed for order',
        );
      }
    }
    if (orders.length < batch) break;
    cursor = orders[orders.length - 1]?.id;
  }
  return outcome;
}
