import type { AccessResponse } from '@xstore/shared';
import { SECTIONS, type Section } from '../catalog/sections';

export type NavItem = { href: string; label: string };

/** Who is looking at the header: a guest, a signed-in buyer, a buyer with paid access. */
export type NavState = { signedIn: boolean; hasAccess: boolean };

export const GUEST: NavState = { signedIn: false, hasAccess: false };

/** Header end slot: «entry» is the blue pill, «quiet» a grey link (hidden below 48em). */
export type EndItem = NavItem & { kind: 'entry' | 'quiet' };

const pricing: NavItem = { href: '/pricing', label: 'Тарифы' };
const signin: NavItem = { href: '/signin', label: 'Войти' };
const access: NavItem = { href: '/access', label: 'Мой доступ' };

const connect: NavItem = { href: '/get', label: 'Подключить iPhone' };

/** Support is by mail in working hours; there is no support page. */
export const SUPPORT_MAIL = 'support@xstorex.app';

/** The middle row after «Каталог» (spec 2026-11-23-home-first-screen §2, owner 2026-11-25). */
const rowItems: NavItem[] = [
  { href: '/#how', label: 'Как это работает' },
  { href: '/faq', label: 'Вопросы' },
];

/** `GET /access` sends `email` and `hasPassword` only with a buyer session. */
export function navStateFrom(res: AccessResponse): NavState {
  return { signedIn: res.hasPassword !== undefined, hasAccess: res.state.kind === 'active' };
}

/**
 * Header end slot from 48em (spec 2026-11-23-home-first-screen §2): «Войти» (or «Мой доступ» once
 * signed in) and the «Подключить iPhone» button; a subscriber sees only «Мой доступ». A phone pill
 * hides it (owner 2026-11-23): these links live in the menu's «Доступ» card.
 */
export function navFor(state: NavState): EndItem[] {
  if (state.hasAccess) return [{ ...access, kind: 'entry' }];
  return [
    { ...(state.signedIn ? access : signin), kind: 'quiet' },
    { ...connect, kind: 'entry' },
  ];
}

/** The middle row: the same for everyone. */
export function navItems(): NavItem[] {
  return [...rowItems];
}

/** A menu item is active on its own page and on every page below it. */
export function isActive(path: string, href: string): boolean {
  return path === href || path.startsWith(`${href}/`);
}

export type PhonePromo = {
  kicker: string;
  title: string;
  /** The white button of the blue card. */
  primary: NavItem;
  /** The glass button under it: the way in for someone who has already paid. */
  secondary?: NavItem;
};

export type PhoneMenu = { promo: PhonePromo; main: NavItem[]; more: NavItem[] };

/**
 * The phone menu (owner 2026-11-25, spec 2026-11-25-mobile-menu-design): a blue subscription card
 * that follows the session, the catalog large, the secondary pages small and grey. A subscriber is
 * not offered to buy again: no «Тарифы», the card leads to «Мой доступ».
 */
export function phoneMenu(state: NavState): PhoneMenu {
  const main: NavItem[] = [
    ...SECTIONS.map((s) => ({ href: s.href, label: s.title })),
    { href: '/search', label: 'Поиск' },
  ];
  if (state.hasAccess) {
    return {
      promo: { kicker: 'Подписка активна', title: 'Весь каталог уже ваш', primary: access },
      main,
      more: [...rowItems],
    };
  }
  return {
    promo: {
      kicker: 'Подписка',
      title: 'Весь каталог в одной подписке',
      primary: connect,
      secondary: state.signedIn ? access : { href: signin.href, label: 'Есть доступ? Войти' },
    },
    main,
    more: [...rowItems, pricing],
  };
}

/** Paths where «Каталог» is the current header item: the catalog, its sections and search. */
const catalogPaths = [...SECTIONS.map((s) => s.href), '/search'];

export function isCatalogPath(path: string): boolean {
  return catalogPaths.some((href) => isActive(path, href));
}

export type CatalogMenuItem = NavItem & {
  lead: string;
  /** 24px line icon path. */
  icon: string;
  /** A section whose first apps are shown as icons. */
  section?: Section['slug'];
};

export type CatalogPromo = { kicker: string; title: string; href: string; label: string };

const SEARCH_ICON = 'M10.75 16.75a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM15.25 15.25l4 4';

/**
 * The desktop «Каталог» panel (spec 2026-11-17 §5, owners 2026-11-20 and 2026-11-24): the two
 * sections with their apps, search, and a blue card that follows the session.
 */
export function catalogMenu(state: NavState): { items: CatalogMenuItem[]; promo: CatalogPromo } {
  const items: CatalogMenuItem[] = [
    ...SECTIONS.map((s) => ({
      href: s.href,
      label: s.title,
      lead: s.lead,
      icon: s.icon,
      section: s.slug,
    })),
    { href: '/search', label: 'Поиск', lead: 'Найти приложение по названию', icon: SEARCH_ICON },
  ];
  const promo: CatalogPromo = state.hasAccess
    ? {
        kicker: 'Подписка активна',
        title: 'Весь каталог уже ваш',
        href: '/access',
        label: 'Мой доступ',
      }
    : {
        kicker: 'Подписка',
        title: 'Весь каталог в одной подписке',
        href: '/pricing',
        label: 'Смотреть тарифы',
      };
  return { items, promo };
}
