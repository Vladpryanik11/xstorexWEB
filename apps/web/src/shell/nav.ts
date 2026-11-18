import type { AccessResponse } from '@xstore/shared';
import { SECTIONS } from '../catalog/sections';

export type NavItem = { href: string; label: string };

/** Who is looking at the header: a guest, a signed-in buyer, a buyer with paid access. */
export type NavState = { signedIn: boolean; hasAccess: boolean };

export const GUEST: NavState = { signedIn: false, hasAccess: false };

/** Header end slot: «entry» is the blue pill, «quiet» a grey link (hidden below 48em). */
export type EndItem = NavItem & { kind: 'entry' | 'quiet' };

const pricing: NavItem = { href: '/pricing', label: 'Тарифы' };
const signin: NavItem = { href: '/signin', label: 'Войти' };
const access: NavItem = { href: '/access', label: 'Мой доступ' };

const siteItems: NavItem[] = [
  { href: '/blog', label: 'Блог' },
  { href: '/faq', label: 'Вопросы' },
  { href: '/support', label: 'Поддержка' },
];

/** `GET /access` sends `email` and `hasPassword` only with a buyer session. */
export function navStateFrom(res: AccessResponse): NavState {
  return { signedIn: res.hasPassword !== undefined, hasAccess: res.state.kind === 'active' };
}

/**
 * Header end slot (spec v2 §2): a guest sees «Тарифы» and «Войти», a subscriber «Мой доступ».
 * A signed-in buyer without access keeps «Тарифы» and reaches «Мой доступ» instead of «Войти».
 */
export function navFor(state: NavState): EndItem[] {
  if (!state.signedIn) {
    return [
      { ...pricing, kind: 'entry' },
      { ...signin, kind: 'quiet' },
    ];
  }
  if (state.hasAccess) return [{ ...access, kind: 'entry' }];
  return [
    { ...pricing, kind: 'entry' },
    { ...access, kind: 'quiet' },
  ];
}

/** The middle row: the same for everyone. */
export function navItems(): NavItem[] {
  return [...siteItems];
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
        { href: '/catalog', label: 'Весь каталог' },
        ...SECTIONS.filter((s) => s.slug !== 'all').map((s) => ({ href: s.href, label: s.title })),
        { href: '/search', label: 'Поиск' },
      ],
    },
    {
      title: 'Доступ',
      items: navFor(state).map(({ href, label, kind }) =>
        kind === 'quiet' ? { href, label, quiet: true } : { href, label },
      ),
    },
    { title: 'Помощь', items: [...siteItems] },
  ];
}
