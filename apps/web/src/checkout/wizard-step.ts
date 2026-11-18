import type { AccessState, OrderView } from '@xstore/shared';

export type WizardStep = 'pay' | 'checking' | 'paid' | 'failed';

/** «Проверяем оплату…»: ask the API every 2 seconds, give up quietly after 2 minutes. */
export const POLL_INTERVAL_MS = 2000;
export const POLL_LIMIT_MS = 120_000;

/** Session storage key of the wizard's `checkoutKey` (one per opened payment form). */
export const CHECKOUT_KEY_STORAGE = 'xstore.checkoutKey';

/**
 * Which step of the wizard to show. The order wins; only the provider's confirmation (seen as
 * `status: 'paid'`) makes it `paid` — the browser coming back from the payment page does not.
 */
export function wizardStep(input: { order: OrderView | null; access: AccessState }): WizardStep {
  const { order, access } = input;
  if (order) {
    if (order.status === 'paid') return 'paid';
    if (order.status === 'created' || order.status === 'pending') return 'checking';
    return 'failed';
  }
  if (access.kind === 'active') return 'paid';
  if (access.kind === 'payment_pending') return 'checking';
  return 'pay';
}

const rub = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

/** «299 ₽»: whole roubles, a non-breaking space before the sign. */
export function formatRub(amount: number): string {
  return `${rub.format(amount)} ₽`;
}
