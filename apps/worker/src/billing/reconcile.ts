import { applyPayment } from '@xstore/billing';
import type { WorkerDeps } from '../deps.js';

export const RECONCILE_AFTER_MS = 10 * 60 * 1000;
const BATCH = 200;

export type ReconcileOutcome = { checked: number; granted: number; errors: number };

/**
 * `billing:reconcile`: re-reads every `pending` order older than 10 minutes at the provider and
 * applies the result, so a lost webhook still grants access. `applyPayment` is idempotent and
 * serialized with webhooks, so running next to one is safe. A failure on one order is logged and
 * does not stop the rest.
 */
export async function reconcileOrders(
  deps: WorkerDeps,
  now: Date = new Date(),
): Promise<ReconcileOutcome> {
  const { db, logger, payments } = deps;
  const outcome: ReconcileOutcome = { checked: 0, granted: 0, errors: 0 };
  if (!payments) {
    logger.warn('billing:reconcile skipped: payment provider adapter is not configured');
    return outcome;
  }
  const orders = await db.order.findMany({
    where: {
      status: 'pending',
      providerPaymentId: { not: null },
      createdAt: { lt: new Date(now.getTime() - RECONCILE_AFTER_MS) },
    },
    orderBy: { createdAt: 'asc' },
    take: BATCH,
    select: { id: true, providerPaymentId: true },
  });
  for (const order of orders) {
    if (!order.providerPaymentId) continue;
    outcome.checked += 1;
    try {
      const res = await applyPayment(db, payments, order.providerPaymentId, { kind: 'reconcile' });
      if (res.result === 'granted') outcome.granted += 1;
      if (res.result === 'mismatch') {
        logger.warn({ orderId: order.id }, 'billing:reconcile payment amount mismatch');
      }
    } catch (err) {
      outcome.errors += 1;
      logger.warn(
        { orderId: order.id, err: err instanceof Error ? err.message : String(err) },
        'billing:reconcile failed for order',
      );
    }
  }
  return outcome;
}
