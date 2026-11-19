import { extendUserSessions } from '@xstore/billing';
import { sendPaymentPaid } from '@xstore/mail';
import type { WorkerDeps } from '../deps.js';

/**
 * «Оплата прошла» after a grant by reconcile or expiry. At most once per order (shared with the
 * API webhook path through `NotificationLog.dedupeKey`). The payment is already applied, so an
 * error here is logged and never fails the job.
 */
async function notifyPaid(deps: WorkerDeps, orderId: string): Promise<void> {
  try {
    await sendPaymentPaid(deps.mail, orderId);
  } catch (err) {
    deps.logger.warn(
      { orderId, err: err instanceof Error ? err.message : String(err) },
      'payment_paid mail failed',
    );
  }
}

/**
 * Follow-ups of a grant by reconcile or expiry, as the API webhook path does them: the buyer's
 * sessions move up to the end of paid access plus 7 days, then «Оплата прошла». The payment is
 * already applied, so errors are logged and never fail the job.
 */
export async function afterGranted(deps: WorkerDeps, orderId: string): Promise<void> {
  try {
    const order = await deps.db.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { userId: true },
    });
    await extendUserSessions(deps.db, order.userId);
  } catch (err) {
    deps.logger.warn(
      { orderId, err: err instanceof Error ? err.message : String(err) },
      'session extension after grant failed',
    );
  }
  await notifyPaid(deps, orderId);
}
