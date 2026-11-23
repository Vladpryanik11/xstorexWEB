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

/** Help pages: the phone menu card «Помощь» (the footer lists them too). */
const siteItems: NavItem[] = [
  { href: '/blog', label: 'Блог' },
  { href: '/faq', label: 'Вопросы' },
  { href: '/support', label: 'Поддержка' },
];

/** The middle row after «Каталог» (owner 2026-11-23, spec 2026-11-23-home-first-screen §2). */
const rowItems: NavItem[] = [
  { href: '/#how', label: 'Как это работает' },
  { href: '/faq', label: 'Вопросы' },
  { href: '/blog', label: 'Блог' },
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

/**
 * The «Доступ» card of the phone menu keeps pricing (spec v2 §2) and, since the phone pill holds
 * only the word and the menu (owner 2026-11-23), «Подключить iPhone» for everyone without access.
 */
function accessItems(state: NavState): EndItem[] {
  if (state.hasAccess) return [{ ...access, kind: 'entry' }];
  return [
    { ...connect, kind: 'entry' },
    { ...pricing, kind: 'entry' },
    { ...(state.signedIn ? access : signin), kind: 'quiet' },
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

export type MenuCard = { title: string; items: (NavItem & { quiet?: boolean })[] };

/** Cards of the phone menu (spec 2026-11-17 §5): catalog, access, help. */
export function menuCards(state: NavState): MenuCard[] {
  return [
    {
      title: 'Каталог',
      items: [
        { href: '/', label: 'Главная' },
        { href: '/catalog', label: 'Весь каталог' },
        ...SECTIONS.filter((s) => s.slug !== 'all').map((s) => ({ href: s.href, label: s.title })),
        { href: '/search', label: 'Поиск' },
      ],
    },
    {
      title: 'Доступ',
      items: accessItems(state).map(({ href, label, kind }) =>
        kind === 'quiet' ? { href, label, quiet: true } : { href, label },
      ),
    },
    { title: 'Помощь', items: [...siteItems] },
  ];
}

/** Paths where «Каталог» is the current header item: the catalog, its sections and search. */
const catalogPaths = ['/catalog', ...SECTIONS.map((s) => s.href), '/search'];

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
 * The desktop «Каталог» panel (spec 2026-11-17 §5, owner 2026-11-20): three sections with their
 * apps, the whole catalog and search, and a blue card that follows the session.
 */
export function catalogMenu(state: NavState): { items: CatalogMenuItem[]; promo: CatalogPromo } {
  const all = SECTIONS.find((s) => s.slug === 'all');
  const items: CatalogMenuItem[] = [
    ...SECTIONS.filter((s) => s.slug !== 'all').map((s) => ({
      href: s.href,
      label: s.title,
      lead: s.lead,
      icon: s.icon,
      section: s.slug,
    })),
    {
      href: '/catalog',
      label: 'Весь каталог',
      lead: all?.lead ?? 'Все приложения по категориям',
      icon: all?.icon ?? SEARCH_ICON,
    },
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
        title: 'Весь каталог на месяц по одной цене',
        href: '/pricing',
        label: 'Смотреть тарифы',
      };
  return { items, promo };
}
