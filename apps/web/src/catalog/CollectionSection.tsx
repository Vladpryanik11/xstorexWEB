import type { CollectionView } from '@xstore/shared';
import { Cover, Rail, RowsGrid, SectionTitle, SpotBanner } from '@xstore/ui';
import { AppCardRow } from './AppCardRow';
import { AppPreview } from './AppPreview';
import styles from './CollectionSection.module.css';
import { appHref, listHref } from './links';

/** A home collection drawn by its `layout` (spec §6.3). */
export function CollectionSection({ collection }: { collection: CollectionView }) {
  const { title, items } = collection;
  if (items.length === 0) return null;
  return (
    <section className={styles.section}>
      <SectionTitle href={listHref(collection.slug)}>{title}</SectionTitle>
      {collection.layout === 'grid3' ? (
        <RowsGrid label={title}>
          {items.map((app) => (
            <AppCardRow key={app.slug} app={app} />
          ))}
        </RowsGrid>
      ) : collection.layout === 'icons' ? (
        <Rail label={title}>
          {items.map((app) => (
            <AppPreview
              key={app.slug}
              slug={app.slug}
              name={app.name}
              subtitle={app.subtitle ?? app.category?.name}
              iconUrl={app.iconUrl}
            />
          ))}
        </Rail>
      ) : collection.layout === 'screenshots' ? (
        <Rail label={title}>
          {items.map((app) => (
            <div key={app.slug} className={styles.coverItem}>
              <Cover src={app.screenshotUrl} alt={`Скриншот: ${app.name}`} />
              <AppCardRow app={app} />
            </div>
          ))}
        </Rail>
      ) : (
        <Rail label={title}>
          {items.map((app) => (
            <SpotBanner
              key={app.slug}
              href={appHref(app.slug)}
              title={app.name}
              subtitle={app.subtitle}
            />
          ))}
        </Rail>
      )}
    </section>
  );
}
