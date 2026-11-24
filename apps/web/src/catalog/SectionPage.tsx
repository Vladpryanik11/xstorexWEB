import type { Metadata } from 'next';
import { orNotFound, serverApi } from '../api/server';
import { CatalogPage, EmptyState, MoreLink } from './CatalogPage';
import { CategoryChips } from './CategoryChips';
import { IconGrid } from './IconGrid';
import styles from './SectionTiles.module.css';
import type { Section } from './sections';

export function sectionMetadata(section: Section): Metadata {
  const title = `${section.title}: приложения для iPhone и iPad`;
  return { title, description: `${section.lead}. ${title} в Xstore.`, openGraph: { title } };
}

const sectionHref = (section: Section, category?: string, cursor?: string) => {
  const q = new URLSearchParams();
  if (category) q.set('c', category);
  if (cursor) q.set('cursor', cursor);
  return q.size > 0 ? `${section.href}?${q}` : section.href;
};

/**
 * One catalog section (owner 2026-11-24): its apps by name, 24 per page, with chips of the
 * subcategories in use; `?c=<slug>` narrows to one.
 */
export async function SectionPage({
  section,
  cursor,
  category,
}: {
  section: Section;
  cursor?: string;
  category?: string;
}) {
  const api = await serverApi();
  const [page, categories] = await Promise.all([
    orNotFound(api.section(section.slug, cursor, category)),
    api.sectionCategories(section.slug).catch(() => []),
  ]);
  const active = categories.some((c) => c.slug === category) ? category : undefined;
  return (
    <CatalogPage
      title={section.title}
      lead={
        <>
          <p className={styles.pageLead}>{section.lead}</p>
          {categories.length > 0 ? (
            <CategoryChips
              categories={categories}
              active={active}
              filterBase={section.href}
              all={{ href: section.href, label: 'Все' }}
            />
          ) : null}
        </>
      }
    >
      {page.items.length > 0 ? (
        <IconGrid apps={page.items} label={section.title} />
      ) : (
        <EmptyState>Здесь пока пусто. Скоро добавим приложения.</EmptyState>
      )}
      {page.nextCursor ? <MoreLink href={sectionHref(section, active, page.nextCursor)} /> : null}
    </CatalogPage>
  );
}
