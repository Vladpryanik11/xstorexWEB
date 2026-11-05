import type { CollectionView } from '@xstore/shared';
import { Cover, IconTile, Rail, RowsGrid, SectionTitle, SpotBanner } from '@xstore/ui';
import { AppCardRow } from './AppCardRow';
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
            <IconTile
              key={app.slug}
              href={appHref(app.slug)}
              iconSrc={app.iconUrl}
              name={app.name}
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
