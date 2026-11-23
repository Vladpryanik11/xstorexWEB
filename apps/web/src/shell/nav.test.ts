import { describe, expect, it } from 'vitest';
import {
  catalogMenu,
  isActive,
  isCatalogPath,
  menuCards,
  navFor,
  navItems,
  navStateFrom,
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
    expect(navItems().map((i) => i.label)).toEqual(['Как это работает', 'Вопросы', 'Блог']);
    expect(navItems().map((i) => i.href)).toEqual(['/#how', '/faq', '/blog']);
  });
});

describe('menuCards', () => {
  const labels = (state: typeof GUEST) =>
    menuCards(state).map((card) => [card.title, card.items.map((i) => i.label)]);

  it('the word «аккаунт» never shows', () => {
    for (const state of [GUEST, SUBSCRIBER, SIGNED_IN_NO_ACCESS]) {
      expect(JSON.stringify(labels(state)).toLowerCase()).not.toContain('аккаунт');
    }
  });

  it('access card follows the session', () => {
    // Owner 2026-11-23: the phone pill holds only the word and the menu, so «Подключить» moves here.
    expect(labels(GUEST)[1]).toEqual(['Доступ', ['Подключить iPhone', 'Тарифы', 'Войти']]);
    expect(labels(SUBSCRIBER)[1]).toEqual(['Доступ', ['Мой доступ']]);
    expect(labels(SIGNED_IN_NO_ACCESS)[1]).toEqual([
      'Доступ',
      ['Подключить iPhone', 'Тарифы', 'Мой доступ'],
    ]);
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
  it('sections with their apps first, then the whole catalog and search', () => {
    const { items } = catalogMenu(GUEST);
    expect(items.map((i) => [i.label, i.href, i.section])).toEqual([
      ['Удалённые из App Store', '/removed', 'removed'],
      ['Premium доступы', '/premium', 'premium'],
      ['Популярные', '/popular', 'popular'],
      ['Весь каталог', '/catalog', undefined],
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
    for (const path of [
      '/catalog',
      '/catalog/games',
      '/removed',
      '/premium',
      '/popular',
      '/search',
    ]) {
      expect(isCatalogPath(path)).toBe(true);
    }
  });

  it('not the help pages or the home page', () => {
    for (const path of ['/', '/faq', '/blog', '/pricing', '/app/telegram', '/popularity']) {
      expect(isCatalogPath(path)).toBe(false);
    }
  });
});
