import { sendPaymentPaid } from '@xstore/mail';
import type { WorkerDeps } from '../deps.js';

/**
 * «Оплата прошла» after a grant by reconcile or expiry. At most once per order (shared with the
 * API webhook path through `NotificationLog.dedupeKey`). The payment is already applied, so an
 * error here is logged and never fails the job.
 */
export async function notifyPaid(deps: WorkerDeps, orderId: string): Promise<void> {
  try {
    await sendPaymentPaid(deps.mail, orderId);
  } catch (err) {
    deps.logger.warn(
      { orderId, err: err instanceof Error ? err.message : String(err) },
      'payment_paid mail failed',
    );
  }
}
