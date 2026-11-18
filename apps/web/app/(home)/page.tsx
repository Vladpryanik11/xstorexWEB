import type { AppDetail } from '@xstore/shared';
import { SearchField } from '@xstore/ui';
import type { Metadata } from 'next';
import { Fragment } from 'react';
import { serverApi } from '../../src/api/server';
import { AppPreview } from '../../src/catalog/AppPreview';
import { CategoryChips } from '../../src/catalog/CategoryChips';
import { CollectionSection } from '../../src/catalog/CollectionSection';
import { HeroCarousel } from '../../src/catalog/HeroCarousel';
import { HowItWorks } from '../../src/catalog/HowItWorks';
import { SectionTiles } from '../../src/catalog/SectionTiles';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: { absolute: 'Xstore — приложения для iPhone и iPad' },
  description:
    'Каталог приложений для iPhone и iPad. Оплата без регистрации, установка прямо с сайта.',
  openGraph: { title: 'Xstore — приложения для iPhone и iPad', type: 'website' },
};

/** Chips go after this many collections (spec §6.3). */
const CHIPS_AFTER = 2;

type Props = { searchParams: Promise<{ app?: string | string[] }> };

/** `/?app=<slug>`: a shared link opens that app's install sheet; a bad slug is ignored. */
async function sharedApp(api: Awaited<ReturnType<typeof serverApi>>, slug: unknown) {
  if (typeof slug !== 'string' || slug === '') return null;
  return api.app(slug).catch((): AppDetail | null => null);
}

export default async function HomePage({ searchParams }: Props) {
  const api = await serverApi();
  const [home, shared] = await Promise.all([api.home(), sharedApp(api, (await searchParams).app)]);
  const chips = <CategoryChips categories={home.categories} />;

  return (
    <>
      <section className={styles.hero} data-home-hero>
        <span className={styles.word} aria-hidden="true">
          XSTORE
        </span>
        <div className={styles.heroInner}>
          <h1 className={styles.title}>Приложения для iPhone и iPad</h1>
          <p className={styles.lead}>
            Найдите нужное приложение, оплатите и установите его прямо с сайта. Регистрация не
            нужна.
          </p>
          <SearchField action="/search" />
        </div>
      </section>
      <div className={styles.shelves}>
        <SectionTiles />
        <HeroCarousel banners={home.banners} />
        {home.collections.map((c, i) => (
          <Fragment key={c.slug}>
            <CollectionSection collection={c} />
            {i === CHIPS_AFTER - 1 ? chips : null}
          </Fragment>
        ))}
        {home.collections.length < CHIPS_AFTER ? chips : null}
        <HowItWorks />
      </div>
      {shared ? (
        <AppPreview
          key={shared.slug}
          variant="none"
          initialOpen
          slug={shared.slug}
          name={shared.name}
          subtitle={shared.subtitle ?? shared.category?.name}
          iconUrl={shared.iconUrl}
        />
      ) : null}
    </>
  );
}
