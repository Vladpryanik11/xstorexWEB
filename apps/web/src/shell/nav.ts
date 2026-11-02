export type NavItem = { href: string; label: string };

const accountItems: NavItem[] = [
  { href: '/devices', label: 'Ваши устройства' },
  { href: '/profile', label: 'Профиль' },
];

const siteItems: NavItem[] = [
  { href: '/blog', label: 'Блог' },
  { href: '/faq', label: 'Вопросы' },
  { href: '/support', label: 'Поддержка' },
];

export function navItems(signedIn: boolean): NavItem[] {
  return signedIn ? [...accountItems, ...siteItems] : [...siteItems];
}

/** A menu item is active on its own page and on every page below it. */
export function isActive(path: string, href: string): boolean {
  return path === href || path.startsWith(`${href}/`);
}
