import { applyPayment } from '@xstore/billing';
import type { WorkerDeps } from '../deps.js';
import { afterGranted } from './notify.js';

export const RECONCILE_AFTER_MS = 10 * 60 * 1000;
export const BATCH = 200;

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
  batch: number = BATCH,
): Promise<ReconcileOutcome> {
  const { db, logger, payments } = deps;
  const outcome: ReconcileOutcome = { checked: 0, granted: 0, errors: 0 };
  if (!payments) {
    logger.warn('billing:reconcile skipped: payment provider adapter is not configured');
    return outcome;
  }
  let cursor: string | undefined;
  for (;;) {
    // Keyset paging over the whole backlog: abandoned payments stay `pending` forever and must
    // not starve newer orders.
    const orders = await db.order.findMany({
      where: {
        status: 'pending',
        providerPaymentId: { not: null },
        createdAt: { lt: new Date(now.getTime() - RECONCILE_AFTER_MS) },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: batch,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, providerPaymentId: true },
    });
    for (const order of orders) {
      if (!order.providerPaymentId) continue;
      outcome.checked += 1;
      try {
        const res = await applyPayment(db, payments, order.providerPaymentId, {
          kind: 'reconcile',
        });
        if (res.result === 'granted') {
          outcome.granted += 1;
          if (res.orderId) await afterGranted(deps, res.orderId);
        }
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
    if (orders.length < batch) break;
    cursor = orders[orders.length - 1]?.id;
  }
  return outcome;
}
