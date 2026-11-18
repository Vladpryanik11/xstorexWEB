import { describe, expect, it } from 'vitest';
import {
  accessState,
  accessUntil,
  formatRuDate,
  nextWindow,
  type RightLike,
  userSessionExpiry,
} from './access.js';

const d = (s: string) => new Date(s);
const right = (a: string, b: string, revoked: string | null = null): RightLike => ({
  startsAt: d(a),
  expiresAt: d(b),
  revokedAt: revoked ? d(revoked) : null,
});

describe('nextWindow', () => {
  it('первая оплата: 30 суток от оплаты', () => {
    const w = nextWindow([], 30, d('2026-11-18T12:00:00Z'));
    expect(w.startsAt).toEqual(d('2026-11-18T12:00:00Z'));
    expect(w.expiresAt).toEqual(d('2026-12-18T12:00:00Z'));
  });
  it('продление начинается с конца текущего периода', () => {
    const w = nextWindow(
      [right('2026-11-18T12:00:00Z', '2026-12-18T12:00:00Z')],
      30,
      d('2026-12-10T09:00:00Z'),
    );
    expect(w.startsAt).toEqual(d('2026-12-18T12:00:00Z'));
    expect(w.expiresAt).toEqual(d('2027-01-17T12:00:00Z'));
  });
  it('после перерыва начинается в момент оплаты', () => {
    const w = nextWindow(
      [right('2026-11-18T12:00:00Z', '2026-12-18T12:00:00Z')],
      30,
      d('2027-02-01T00:00:00Z'),
    );
    expect(w.startsAt).toEqual(d('2027-02-01T00:00:00Z'));
  });
  it('отозванный период не учитывается', () => {
    const w = nextWindow(
      [right('2026-11-18T12:00:00Z', '2026-12-18T12:00:00Z', '2026-11-20T00:00:00Z')],
      30,
      d('2026-12-10T09:00:00Z'),
    );
    expect(w.startsAt).toEqual(d('2026-12-10T09:00:00Z'));
  });
});

describe('accessUntil', () => {
  const now = d('2026-12-01T00:00:00Z');
  it('склеивает смежные периоды', () => {
    const r = [
      right('2026-11-18T12:00:00Z', '2026-12-18T12:00:00Z'),
      right('2026-12-18T12:00:00Z', '2027-01-17T12:00:00Z'),
    ];
    expect(accessUntil(r, now)).toEqual(d('2027-01-17T12:00:00Z'));
  });
  it('отозванный период не продлевает цепочку', () => {
    const r = [
      right('2026-11-18T12:00:00Z', '2026-12-18T12:00:00Z'),
      right('2026-12-18T12:00:00Z', '2027-01-17T12:00:00Z', '2026-12-02T00:00:00Z'),
    ];
    expect(accessUntil(r, now)).toEqual(d('2026-12-18T12:00:00Z'));
  });
  it('null, если сейчас доступа нет', () => {
    expect(accessUntil([right('2026-10-01T00:00:00Z', '2026-10-31T00:00:00Z')], now)).toBeNull();
    expect(accessUntil([right('2027-01-01T00:00:00Z', '2027-01-31T00:00:00Z')], now)).toBeNull();
    expect(accessUntil([], now)).toBeNull();
  });
  it('конец периода не включается', () => {
    expect(accessUntil([right('2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z')], now)).toBeNull();
  });
});

describe('userSessionExpiry', () => {
  const now = d('2026-11-18T12:00:00Z');
  it('без доступа: +30 суток', () => {
    expect(userSessionExpiry(now, null)).toEqual(d('2026-12-18T12:00:00Z'));
  });
  it('доступ на 60 суток: until + 7', () => {
    const until = d('2027-01-17T12:00:00Z');
    expect(userSessionExpiry(now, until)).toEqual(d('2027-01-24T12:00:00Z'));
  });
  it('короткий доступ: не меньше +30 суток', () => {
    expect(userSessionExpiry(now, d('2026-11-20T00:00:00Z'))).toEqual(d('2026-12-18T12:00:00Z'));
  });
});

describe('accessState', () => {
  const now = d('2026-12-01T00:00:00Z');
  const sub = {
    id: 's1',
    deviceReady: true,
    rights: [right('2026-11-18T12:00:00Z', '2026-12-18T12:00:00Z')],
  };
  it('active имеет приоритет над ожидающим заказом', () => {
    expect(
      accessState({ signedIn: true, subscriptions: [sub], pendingOrderId: 'o1', now }),
    ).toEqual({
      kind: 'active',
      until: d('2026-12-18T12:00:00Z'),
      subscriptionId: 's1',
      deviceReady: true,
    });
  });
  it('payment_pending без действующей подписки', () => {
    expect(accessState({ signedIn: true, subscriptions: [], pendingOrderId: 'o1', now })).toEqual({
      kind: 'payment_pending',
      orderId: 'o1',
    });
  });
  it('none', () => {
    expect(accessState({ signedIn: false, subscriptions: [], pendingOrderId: null, now })).toEqual({
      kind: 'none',
    });
  });
});

describe('formatRuDate', () => {
  it('по Москве', () => {
    expect(formatRuDate(d('2026-12-18T21:30:00Z'))).toBe('19 декабря 2026');
    expect(formatRuDate(d('2026-12-18T12:00:00Z'))).toBe('18 декабря 2026');
  });
});
