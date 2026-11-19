import { describe, expect, it } from 'vitest';
import { isActive, menuCards, navFor, navItems, navStateFrom } from './nav';

const GUEST = { signedIn: false, hasAccess: false };
const SUBSCRIBER = { signedIn: true, hasAccess: true };
const SIGNED_IN_NO_ACCESS = { signedIn: true, hasAccess: false };

describe('navFor', () => {
  it('guest: pricing and sign-in', () => {
    expect(navFor(GUEST)).toEqual([
      { href: '/pricing', label: 'Тарифы', kind: 'entry' },
      { href: '/signin', label: 'Войти', kind: 'quiet' },
    ]);
  });

  it('subscriber: «Мой доступ» only', () => {
    expect(navFor(SUBSCRIBER)).toEqual([{ href: '/access', label: 'Мой доступ', kind: 'entry' }]);
  });

  it('signed in without access: pricing stays, «Мой доступ» replaces sign-in', () => {
    expect(navFor(SIGNED_IN_NO_ACCESS)).toEqual([
      { href: '/pricing', label: 'Тарифы', kind: 'entry' },
      { href: '/access', label: 'Мой доступ', kind: 'quiet' },
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
    expect(navItems().map((i) => i.label)).toEqual(['Блог', 'Вопросы', 'Поддержка']);
    expect(navItems().map((i) => i.href)).toEqual(['/blog', '/faq', '/support']);
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
    expect(labels(GUEST)[1]).toEqual(['Доступ', ['Тарифы', 'Войти']]);
    expect(labels(SUBSCRIBER)[1]).toEqual(['Доступ', ['Мой доступ']]);
    expect(labels(SIGNED_IN_NO_ACCESS)[1]).toEqual(['Доступ', ['Тарифы', 'Мой доступ']]);
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
