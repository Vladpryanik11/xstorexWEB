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

export type MenuCard = { title: string; items: (NavItem & { quiet?: boolean })[] };

/** Cards of the phone menu (spec 2026-11-17 §5): catalog, account, help. */
export function menuCards(signedIn: boolean): MenuCard[] {
  return [
    {
      title: 'Каталог',
      items: [
        { href: '/', label: 'Главная' },
        { href: '/search', label: 'Поиск' },
      ],
    },
    {
      title: 'Аккаунт',
      items: signedIn
        ? [...accountItems, { href: '/signout', label: 'Выйти', quiet: true }]
        : [
            { href: '/pricing', label: 'Тарифы' },
            { href: '/signin', label: 'Войти', quiet: true },
          ],
    },
    { title: 'Помощь', items: [...siteItems] },
  ];
}
