/**
 * Catalog sections (owner 2026-11-18): four entry points shown on the home page and in the
 * menu. `api` is the slug of `GET /catalog/sections/:slug`.
 */
export type Section = {
  slug: 'removed' | 'premium' | 'popular' | 'all';
  href: string;
  title: string;
  lead: string;
  /** 24px line icon path, drawn for Xstore. */
  icon: string;
};

export const SECTIONS: readonly Section[] = [
  {
    slug: 'removed',
    href: '/removed',
    title: 'Удалённые из App Store',
    lead: 'Их больше нет в App Store, а здесь есть',
    icon: 'M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.5a4 4 0 0 1 .5 8M9.5 13.5l5 5M14.5 13.5l-5 5',
  },
  {
    slug: 'premium',
    href: '/premium',
    title: 'Premium доступы',
    lead: 'Приложения с расширенным доступом',
    icon: 'M4 17.5h16M4.5 15 3 7l5 3.5L12 4l4 6.5L21 7l-1.5 8z',
  },
  {
    slug: 'popular',
    href: '/popular',
    title: 'Популярные',
    lead: 'Что устанавливают чаще всего',
    icon: 'M12 21c3.9 0 6.5-2.6 6.5-6.2 0-3.8-3.3-6.3-4.3-10.3-1.9 1.4-3 3.4-3 5.6-1.2-.5-2-1.7-2.2-3C7 8.6 5.5 11.4 5.5 14.6 5.5 18.4 8.1 21 12 21Z',
  },
  {
    slug: 'all',
    href: '/catalog',
    title: 'Весь каталог',
    lead: 'Все приложения по категориям',
    icon: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
  },
];

export function sectionBySlug(slug: string): Section | undefined {
  return SECTIONS.find((s) => s.slug === slug);
}

/** A section by its known slug (route pages). */
export function sectionOf(slug: Section['slug']): Section {
  const section = sectionBySlug(slug);
  if (!section) throw new Error(`unknown section ${slug}`);
  return section;
}
