/**
 * Catalog sections (owner 2026-11-24): only «Удалённые» and «Премиум», each split by
 * subcategories. `slug` is the slug of `GET /catalog/sections/:slug`.
 */
export type Section = {
  slug: 'removed' | 'premium';
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
