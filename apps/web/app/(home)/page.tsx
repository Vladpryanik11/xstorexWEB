import { ApiClientError, type AppCard, type AppDetail } from '@xstore/shared';
import { SearchField } from '@xstore/ui';
import type { Metadata, Viewport } from 'next';
import { Fragment } from 'react';
import { serverApi } from '../../src/api/server';
import { AppPreview } from '../../src/catalog/AppPreview';
import { CategoryChips } from '../../src/catalog/CategoryChips';
import { CollectionSection } from '../../src/catalog/CollectionSection';
import { HeroCarousel } from '../../src/catalog/HeroCarousel';
import { HowItWorks } from '../../src/catalog/HowItWorks';
import { SectionTiles } from '../../src/catalog/SectionTiles';
import { HomeBenefits } from '../../src/home/HomeBenefits';
import { HomeHero } from '../../src/home/HomeHero';
import { HomeFaq, HomeFinal, HomePlan, HomeStats, HomeWhy } from '../../src/home/HomeSell';
import { HomeStickyCta } from '../../src/home/HomeStickyCta';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: { absolute: 'Xstore — приложения для iPhone и iPad' },
  description:
    '200+ приложений с Premium‑доступом на вашем iPhone, в том числе удалённые из App Store. Установка прямо из Safari.',
  openGraph: { title: 'Xstore — приложения для iPhone и iPad', type: 'website' },
};

/** iPhone status bar matches the bright sky of the hero (spec 2026-11-23-home-first-screen §4). */
export const viewport: Viewport = { themeColor: '#1e8fff' };

/** Chips go after this many collections (spec §6.3). */
const CHIPS_AFTER = 2;

type Props = { searchParams: Promise<{ app?: string | string[] }> };

/** `/?app=<slug>`: a shared link opens that app's install sheet; a bad slug is ignored. */
async function sharedApp(api: Awaited<ReturnType<typeof serverApi>>, slug: unknown) {
  if (typeof slug !== 'string' || slug === '') return null;
  return api.app(slug).catch((): AppDetail | null => null);
}

/** The plan price for the selling blocks; without a plan they still render, just without a price. */
async function planPrice(api: Awaited<ReturnType<typeof serverApi>>): Promise<number | null> {
  try {
    return (await api.getPlan()).priceRub;
  } catch (err) {
    if (err instanceof ApiClientError && err.status < 500) return null;
    throw err;
  }
}

/** First page of a catalog section for the hero lanes; the home page still opens without it. */
async function laneApps(api: Awaited<ReturnType<typeof serverApi>>, slug: 'removed' | 'premium') {
  return api
    .section(slug)
    .then((page) => page.items)
    .catch((): AppCard[] => []);
}

export default async function HomePage({ searchParams }: Props) {
  const api = await serverApi();
  const [home, shared, priceRub, removed, premium] = await Promise.all([
    api.home(),
    sharedApp(api, (await searchParams).app),
    planPrice(api),
    laneApps(api, 'removed'),
    laneApps(api, 'premium'),
  ]);
  const chips = <CategoryChips categories={home.categories} />;

  return (
    <>
      <HomeHero collections={home.collections} lanes={{ removed, premium }} />
      {/* Order «Проверь и купи» (owner 2026-11-21, spec v2 §3.1): check, figures, how, why, plan,
          catalog, questions, last call. */}
      <div className={styles.flow}>
        <HomeBenefits />
        <div className={styles.check}>
          <section className={styles.find} aria-labelledby="home-find">
            <h2 id="home-find" className={styles.findTitle}>
              Ищете конкретное приложение?
            </h2>
            <p className={styles.findLead}>Проверьте, есть ли оно в каталоге.</p>
            <div className={styles.findField}>
              <SearchField action="/search" />
            </div>
          </section>
          <SectionTiles />
        </div>
        <HomeStats />
        <HowItWorks />
        <HomeWhy />
        <HomePlan priceRub={priceRub} />
        <div className={styles.catalog}>
          <HeroCarousel banners={home.banners} />
          {home.collections.map((c, i) => (
            <Fragment key={c.slug}>
              <CollectionSection collection={c} />
              {i === CHIPS_AFTER - 1 ? chips : null}
            </Fragment>
          ))}
          {home.collections.length < CHIPS_AFTER ? chips : null}
        </div>
        <HomeFaq />
        <HomeFinal priceRub={priceRub} />
      </div>
      <HomeStickyCta />
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
