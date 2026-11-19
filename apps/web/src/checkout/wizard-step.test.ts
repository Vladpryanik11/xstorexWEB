import type { AccessState, OrderView } from '@xstore/shared';
import { describe, expect, it } from 'vitest';
import {
  formatRub,
  POLL_INTERVAL_MS,
  POLL_LIMIT_MS,
  settledTitle,
  wizardStep,
} from './wizard-step';

const none: AccessState = { kind: 'none' };
const order = (status: OrderView['status']): OrderView => ({
  id: 'ord_1',
  status,
  amountRub: 299,
  paidAt: status === 'paid' ? '2026-11-18T10:00:00.000Z' : null,
  returnTo: null,
  accessUntil: status === 'paid' ? '2026-12-18T10:00:00.000Z' : null,
  paymentUrl: null,
});

describe('settledTitle', () => {
  it('names why the order did not give access', () => {
    expect(settledTitle('failed')).toBe('Оплата не прошла');
    expect(settledTitle('expired')).toBe('Время на оплату истекло');
    expect(settledTitle('refunded')).toBe('Оплата возвращена');
  });
});

describe('wizardStep', () => {
  it('pending order → checking', () => {
    expect(wizardStep({ order: order('pending'), access: none })).toBe('checking');
  });

  it('paid order → paid', () => {
    expect(wizardStep({ order: order('paid'), access: none })).toBe('paid');
  });

  it('failed order → failed', () => {
    expect(wizardStep({ order: order('failed'), access: none })).toBe('failed');
    expect(wizardStep({ order: order('expired'), access: none })).toBe('failed');
    expect(wizardStep({ order: order('refunded'), access: none })).toBe('failed');
  });

  it('return before webhook shows checking state', () => {
    // The browser is back from the payment page; the provider has not confirmed yet.
    const access: AccessState = { kind: 'payment_pending', orderId: 'ord_1' };
    expect(wizardStep({ order: order('created'), access })).toBe('checking');
    expect(wizardStep({ order: order('pending'), access })).toBe('checking');
  });

  it('without an order: pay, or the step of the current access', () => {
    expect(wizardStep({ order: null, access: none })).toBe('pay');
    expect(wizardStep({ order: null, access: { kind: 'payment_pending', orderId: 'o' } })).toBe(
      'checking',
    );
    expect(
      wizardStep({
        order: null,
        access: { kind: 'active', until: new Date(), subscriptionId: 's', device: null },
      }),
    ).toBe('paid');
  });

  it('polls every 2 seconds for up to 2 minutes', () => {
    expect(POLL_INTERVAL_MS).toBe(2000);
    expect(POLL_LIMIT_MS).toBe(120_000);
  });
});

describe('formatRub', () => {
  it('formats whole roubles', () => {
    expect(formatRub(299).replace(/\s/g, ' ')).toBe('299 ₽');
    expect(formatRub(1490).replace(/\s/g, ' ')).toBe('1 490 ₽');
  });
});
