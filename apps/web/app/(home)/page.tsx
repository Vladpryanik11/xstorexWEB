import { ApiClientError, type AppCard, type AppDetail } from '@xstore/shared';
import type { Metadata, Viewport } from 'next';
import { serverApi } from '../../src/api/server';
import { AppPreview } from '../../src/catalog/AppPreview';
import { HomeHero } from '../../src/home/HomeHero';
import { HomeFaq, HomePlan } from '../../src/home/HomeSell';
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
  const [shared, priceRub, removed, premium] = await Promise.all([
    sharedApp(api, (await searchParams).app),
    planPrice(api),
    laneApps(api, 'removed'),
    laneApps(api, 'premium'),
  ]);

  return (
    <>
      <HomeHero lanes={{ removed, premium }} />
      {/* Owner 2026-11-24 12:29 (variant Б): the first screen answers the questions, so under it
          only the plan and the questions stay, on white for the sky to flow into. */}
      <div className={styles.flow}>
        <HomePlan priceRub={priceRub} apps={[...removed, ...premium]} />
        <HomeFaq />
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
