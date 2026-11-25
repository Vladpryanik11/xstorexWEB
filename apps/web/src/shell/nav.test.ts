import { describe, expect, it } from 'vitest';
import {
  catalogMenu,
  isActive,
  isCatalogPath,
  navFor,
  navItems,
  navStateFrom,
  phoneMenu,
} from './nav';

const GUEST = { signedIn: false, hasAccess: false };
const SUBSCRIBER = { signedIn: true, hasAccess: true };
const SIGNED_IN_NO_ACCESS = { signedIn: true, hasAccess: false };

describe('navFor', () => {
  // Owner 2026-11-23 (spec 2026-11-23-home-first-screen §2): «Войти» and «Подключить iPhone» always.
  it('guest: sign-in and «Подключить iPhone»', () => {
    expect(navFor(GUEST)).toEqual([
      { href: '/signin', label: 'Войти', kind: 'quiet' },
      { href: '/get', label: 'Подключить iPhone', kind: 'entry' },
    ]);
  });

  it('subscriber: «Мой доступ» only', () => {
    expect(navFor(SUBSCRIBER)).toEqual([{ href: '/access', label: 'Мой доступ', kind: 'entry' }]);
  });

  it('signed in without access: «Мой доступ» replaces sign-in, the button stays', () => {
    expect(navFor(SIGNED_IN_NO_ACCESS)).toEqual([
      { href: '/access', label: 'Мой доступ', kind: 'quiet' },
      { href: '/get', label: 'Подключить iPhone', kind: 'entry' },
    ]);
  });
});

describe('navStateFrom', () => {
  it('a reply without buyer fields is a guest', () => {
    expect(navStateFrom({ state: { kind: 'none' } })).toEqual(GUEST);
  });

  it('a buyer with access', () => {
    expect(
      navStateFrom({
        state: { kind: 'active', until: new Date(), subscriptionId: 's', device: null },
        email: 'a@b.ru',
        hasPassword: false,
      }),
    ).toEqual(SUBSCRIBER);
  });

  it('a buyer still waiting for the payment', () => {
    expect(
      navStateFrom({
        state: { kind: 'payment_pending', orderId: 'o' },
        email: 'a@b.ru',
        hasPassword: true,
      }),
    ).toEqual(SIGNED_IN_NO_ACCESS);
  });
});

describe('navItems', () => {
  it('the middle row is the same for everyone', () => {
    expect(navItems().map((i) => i.label)).toEqual(['Как это работает', 'Вопросы']);
    expect(navItems().map((i) => i.href)).toEqual(['/#how', '/faq']);
  });
});

describe('phoneMenu', () => {
  const pick = (state: typeof GUEST) => {
    const m = phoneMenu(state);
    return {
      promo: [m.promo.kicker, m.promo.title, m.promo.primary.label, m.promo.secondary?.label],
      main: m.main.map((i) => i.label),
      more: m.more.map((i) => i.label),
    };
  };

  it('the word «аккаунт» never shows', () => {
    for (const state of [GUEST, SUBSCRIBER, SIGNED_IN_NO_ACCESS]) {
      expect(JSON.stringify(phoneMenu(state)).toLowerCase()).not.toContain('аккаунт');
    }
  });

  it('a guest: the subscription card offers to connect, then «Есть доступ? Войти»', () => {
    expect(pick(GUEST)).toEqual({
      promo: [
        'Подписка',
        'Весь каталог в одной подписке',
        'Подключить iPhone',
        'Есть доступ? Войти',
      ],
      main: ['Удалённые из App Store', 'Premium доступы', 'Поиск'],
      more: ['Как это работает', 'Вопросы', 'Тарифы'],
    });
    const m = phoneMenu(GUEST);
    expect(m.promo.primary.href).toBe('/get');
    expect(m.promo.secondary?.href).toBe('/signin');
    expect(m.main.map((i) => i.href)).toEqual(['/removed', '/premium', '/search']);
    expect(m.more.map((i) => i.href)).toEqual(['/#how', '/faq', '/pricing']);
  });

  it('signed in without access: the second button leads to «Мой доступ»', () => {
    const m = phoneMenu(SIGNED_IN_NO_ACCESS);
    expect(m.promo.primary).toEqual({ href: '/get', label: 'Подключить iPhone' });
    expect(m.promo.secondary).toEqual({ href: '/access', label: 'Мой доступ' });
    expect(m.more.map((i) => i.label)).toContain('Тарифы');
  });

  it('a subscriber is not offered to buy again', () => {
    expect(pick(SUBSCRIBER)).toEqual({
      promo: ['Подписка активна', 'Весь каталог уже ваш', 'Мой доступ', undefined],
      main: ['Удалённые из App Store', 'Premium доступы', 'Поиск'],
      more: ['Как это работает', 'Вопросы'],
    });
    expect(phoneMenu(SUBSCRIBER).promo.primary.href).toBe('/access');
  });
});

describe('isActive', () => {
  it('matches the section and its subpages only', () => {
    expect(isActive('/access', '/access')).toBe(true);
    expect(isActive('/access/x', '/access')).toBe(true);
    expect(isActive('/access-old', '/access')).toBe(false);
    expect(isActive('/', '/access')).toBe(false);
  });
});

describe('catalogMenu', () => {
  it('the two sections with their apps, then search', () => {
    const { items } = catalogMenu(GUEST);
    expect(items.map((i) => [i.label, i.href, i.section])).toEqual([
      ['Удалённые из App Store', '/removed', 'removed'],
      ['Premium доступы', '/premium', 'premium'],
      ['Поиск', '/search', undefined],
    ]);
    for (const item of items) {
      expect(item.lead.length).toBeGreaterThan(0);
      expect(item.icon.length).toBeGreaterThan(0);
    }
  });

  it('the blue card leads a guest and a buyer without access to pricing', () => {
    for (const state of [GUEST, SIGNED_IN_NO_ACCESS]) {
      expect(catalogMenu(state).promo).toMatchObject({
        href: '/pricing',
        label: 'Смотреть тарифы',
        // Owner 2026-11-25 (ПК, пункт 4): the words of the plan card on the home page.
        title: 'Весь каталог в одной подписке',
      });
    }
  });

  it('the blue card leads a subscriber to «Мой доступ»', () => {
    expect(catalogMenu(SUBSCRIBER).promo).toMatchObject({ href: '/access', label: 'Мой доступ' });
  });

  it('never says «аккаунт»', () => {
    for (const state of [GUEST, SUBSCRIBER, SIGNED_IN_NO_ACCESS]) {
      expect(JSON.stringify(catalogMenu(state)).toLowerCase()).not.toContain('аккаунт');
    }
  });
});

describe('isCatalogPath', () => {
  it('catalog, its sections and search', () => {
    for (const path of ['/removed', '/premium', '/search']) {
      expect(isCatalogPath(path)).toBe(true);
    }
  });

  it('not the help pages or the home page', () => {
    for (const path of ['/', '/faq', '/blog', '/pricing', '/app/telegram', '/popularity']) {
      expect(isCatalogPath(path)).toBe(false);
    }
  });
});
