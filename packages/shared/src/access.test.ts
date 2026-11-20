import { describe, expect, it } from 'vitest';
import {
  accessState,
  accessUntil,
  formatRuDate,
  nextWindow,
  pickSubscription,
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
    device: { product: 'iPhone16,2', status: 'active' as const },
    rights: [right('2026-11-18T12:00:00Z', '2026-12-18T12:00:00Z')],
  };
  it('active имеет приоритет над ожидающим заказом', () => {
    expect(
      accessState({ signedIn: true, subscriptions: [sub], pendingOrderId: 'o1', now }),
    ).toEqual({
      kind: 'active',
      until: d('2026-12-18T12:00:00Z'),
      subscriptionId: 's1',
      device: {
        model: 'iPhone 15 Pro Max',
        family: 'iphone',
        ready: true,
        needsHelp: false,
        updating: false,
      },
    });
  });
  it('доступ — непрерывная цепочка прав всех подписок покупателя', () => {
    const state = accessState({
      signedIn: true,
      subscriptions: [
        {
          id: 'paid',
          device: null,
          rights: [right('2026-11-10T00:00:00Z', '2026-12-10T00:00:00Z')],
        },
        {
          id: 'grant',
          device: null,
          rights: [right('2026-12-10T00:00:00Z', '2027-01-09T00:00:00Z')],
        },
      ],
      pendingOrderId: null,
      now,
    });
    expect(state).toEqual({
      kind: 'active',
      until: d('2027-01-09T00:00:00Z'),
      subscriptionId: 'grant',
      device: null,
    });
  });
  it('устройство берётся из любой подписки покупателя, не только из выбранной', () => {
    const state = accessState({
      signedIn: true,
      subscriptions: [
        {
          id: 'paid',
          device: { product: 'iPad13,1', status: 'pending' },
          rights: [right('2026-11-10T00:00:00Z', '2026-12-10T00:00:00Z')],
        },
        {
          id: 'grant',
          device: null,
          rights: [right('2026-12-10T00:00:00Z', '2027-01-09T00:00:00Z')],
        },
      ],
      pendingOrderId: null,
      now,
    });
    expect(state).toMatchObject({
      kind: 'active',
      subscriptionId: 'grant',
      device: {
        model: 'iPad13,1',
        family: 'ipad',
        ready: false,
        needsHelp: false,
        updating: false,
      },
    });
  });
  it('устройство выбранной подписки важнее устройства другой', () => {
    const state = accessState({
      signedIn: true,
      subscriptions: [
        {
          id: 'old',
          device: { product: 'iPhone15,2', status: 'active' },
          rights: [right('2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z')],
        },
        {
          id: 'live',
          device: { product: 'iPhone16,2', status: 'processing' },
          rights: [right('2026-11-10T00:00:00Z', '2026-12-10T00:00:00Z')],
        },
      ],
      pendingOrderId: null,
      now,
    });
    expect(state).toMatchObject({
      subscriptionId: 'live',
      device: { model: 'iPhone 15 Pro Max', family: 'iphone', ready: false },
    });
  });
  it('new/pending/processing — готовим; blocked/expired — нужна помощь поддержки', () => {
    const cases = [
      ['new', false, false],
      ['pending', false, false],
      ['processing', false, false],
      ['active', true, false],
      ['blocked', false, true],
      ['expired', false, true],
    ] as const;
    for (const [status, ready, needsHelp] of cases) {
      const state = accessState({
        signedIn: true,
        subscriptions: [{ ...sub, device: { product: 'iPhone16,2', status } }],
        pendingOrderId: null,
        now,
      });
      expect(state).toMatchObject({ device: { ready, needsHelp } });
    }
  });
  it('processing — файлы закончились, «Обновляем доступ»', () => {
    for (const status of ['pending', 'processing', 'active'] as const) {
      const state = accessState({
        signedIn: true,
        subscriptions: [{ ...sub, device: { product: 'iPhone16,2', status } }],
        pendingOrderId: null,
        now,
      });
      expect(state).toMatchObject({ device: { updating: status === 'processing' } });
    }
  });
  it('waitingSince передаётся, пока устройство не готово', () => {
    const since = new Date('2026-11-20T10:00:00Z');
    for (const status of ['pending', 'processing', 'active'] as const) {
      const state = accessState({
        signedIn: true,
        subscriptions: [{ ...sub, device: { product: 'iPhone16,2', status, waitingSince: since } }],
        pendingOrderId: null,
        now,
      });
      if (state.kind !== 'active') throw new Error('active expected');
      expect(state.device?.waitingSince).toEqual(status === 'active' ? undefined : since);
    }
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

describe('pickSubscription', () => {
  const now = d('2026-11-18T12:00:00Z');
  it('нет подписок — null', () => {
    expect(pickSubscription([], now)).toBeNull();
  });
  it('действующая подписка важнее старой истёкшей', () => {
    const subs = [
      { id: 's1', rights: [right('2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z')] },
      { id: 's2', rights: [right('2026-11-10T00:00:00Z', '2026-12-10T00:00:00Z')] },
    ];
    expect(pickSubscription(subs, now)).toBe('s2');
  });
  it('из двух действующих — с более поздним концом доступа', () => {
    const subs = [
      { id: 's1', rights: [right('2026-11-01T00:00:00Z', '2026-12-20T00:00:00Z')] },
      { id: 's2', rights: [right('2026-11-10T00:00:00Z', '2026-12-10T00:00:00Z')] },
    ];
    expect(pickSubscription(subs, now)).toBe('s1');
  });
  it('подписка, чьи права кончаются позже всех (даже если начинаются в будущем)', () => {
    // После присоединения: оплата гостя идёт сейчас, выданные дни — после неё в другой подписке.
    const subs = [
      { id: 'grant', rights: [right('2026-12-10T00:00:00Z', '2027-01-09T00:00:00Z')] },
      { id: 'paid', rights: [right('2026-11-10T00:00:00Z', '2026-12-10T00:00:00Z')] },
    ];
    expect(pickSubscription(subs, now)).toBe('grant');
  });
  it('без действующих — с самым свежим правом', () => {
    const subs = [
      { id: 's1', rights: [] },
      { id: 's2', rights: [right('2026-10-01T00:00:00Z', '2026-10-31T00:00:00Z')] },
      { id: 's3', rights: [right('2026-08-01T00:00:00Z', '2026-08-31T00:00:00Z')] },
      {
        id: 's4',
        rights: [right('2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z', '2026-11-05T00:00:00Z')],
      },
    ];
    expect(pickSubscription(subs, now)).toBe('s4');
  });
  it('без прав вовсе — первая по порядку', () => {
    expect(
      pickSubscription(
        [
          { id: 'a', rights: [] },
          { id: 'b', rights: [] },
        ],
        now,
      ),
    ).toBe('a');
  });
});

describe('formatRuDate', () => {
  it('по Москве', () => {
    expect(formatRuDate(d('2026-12-18T21:30:00Z'))).toBe('19 декабря 2026');
    expect(formatRuDate(d('2026-12-18T12:00:00Z'))).toBe('18 декабря 2026');
  });
});
