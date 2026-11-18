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

/** One catalog section: its apps, 24 per page (popular: top 100 at once). */
export async function SectionPage({ section, cursor }: { section: Section; cursor?: string }) {
  const api = await serverApi();
  const [page, categories] = await Promise.all([
    orNotFound(api.section(section.slug, cursor)),
    section.slug === 'all' ? api.categories() : Promise.resolve([]),
  ]);
  return (
    <CatalogPage
      title={section.title}
      lead={
        <>
          <p className={styles.pageLead}>{section.lead}</p>
          {categories.length > 0 ? <CategoryChips categories={categories} /> : null}
        </>
      }
    >
      {page.items.length > 0 ? (
        <IconGrid apps={page.items} label={section.title} />
      ) : (
        <EmptyState>Здесь пока пусто. Скоро добавим приложения.</EmptyState>
      )}
      {page.nextCursor ? (
        <MoreLink href={`${section.href}?cursor=${encodeURIComponent(page.nextCursor)}`} />
      ) : null}
    </CatalogPage>
  );
}
