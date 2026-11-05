import { InstallBanner, SearchField } from '@xstore/ui';
import type { Metadata } from 'next';
import { Fragment } from 'react';
import { serverApi } from '../../src/api/server';
import { CategoryChips } from '../../src/catalog/CategoryChips';
import { CollectionSection } from '../../src/catalog/CollectionSection';
import { HeroCarousel } from '../../src/catalog/HeroCarousel';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: { absolute: 'Xstore — приложения для iPhone без компьютера' },
  description:
    'Каталог приложений для iPhone и iPad с установкой прямо из Safari, без компьютера и кабеля.',
  openGraph: { title: 'Xstore — приложения для iPhone без компьютера', type: 'website' },
};

/** Chips go after this many collections (spec §6.3). */
const CHIPS_AFTER = 2;

export default async function HomePage() {
  const home = await (await serverApi()).home();
  const chips = <CategoryChips categories={home.categories} />;

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <h1 className={styles.title}>Приложения для iPhone без компьютера</h1>
          <SearchField action="/search" />
        </div>
      </section>
      <div className={styles.shelves}>
        <HeroCarousel banners={home.banners} />
        {home.collections.map((c, i) => (
          <Fragment key={c.slug}>
            <CollectionSection collection={c} />
            {i === CHIPS_AFTER - 1 ? chips : null}
          </Fragment>
        ))}
        {home.collections.length < CHIPS_AFTER ? chips : null}
      </div>
      <InstallBanner href="/install" />
    </>
  );
}
