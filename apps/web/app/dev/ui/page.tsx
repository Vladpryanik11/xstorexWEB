import { Button, Chip, Rail, SearchField, SectionTitle } from '@xstore/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Footer } from '../../../src/shell/Footer';
import { Header } from '../../../src/shell/Header';
import styles from './page.module.css';

export const metadata: Metadata = { title: 'UI', robots: { index: false, follow: false } };

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Dev showcase: `?auth=1` signed-in header, `&path=/devices` forces the active item,
 * `&w=hero` the transparent home variant. Served only when XSTORE_DEV_PAGES=1.
 */
export default async function DevUiPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  if (process.env.XSTORE_DEV_PAGES !== '1') notFound();

  const signedIn = one(params.auth) === '1';
  const overHero = one(params.w) === 'hero';
  const forcedPath = one(params.path);
  const tiles = Array.from({ length: 10 }, (_, i) => `Приложение ${i + 1}`);

  return (
    <>
      <Header signedIn={signedIn} overHero={overHero} forcedPath={forcedPath} />
      <main>
        {overHero ? (
          <section className={styles.hero}>
            <h1 className={styles.heroTitle}>Xstore — магазин приложений для iPhone</h1>
            <SearchField />
          </section>
        ) : null}
        <div className={styles.page}>
          <section className={styles.section}>
            <SectionTitle>Кнопки</SectionTitle>
            <div className={styles.row}>
              <Button href="/pricing">Купить</Button>
              <Button variant="quiet">Подробнее</Button>
              <Button disabled>Недоступно</Button>
            </div>
          </section>

          <section className={styles.section}>
            <SectionTitle>Поиск</SectionTitle>
            <div className={styles.glassPanel}>
              <SearchField />
            </div>
            <div className={styles.pad}>
              <SearchField tone="page" />
            </div>
          </section>

          <section className={styles.section}>
            <SectionTitle>Чипы</SectionTitle>
            <div className={styles.row}>
              <Chip href="/category/games" active>
                Игры
              </Chip>
              <Chip href="/category/photo">Фото</Chip>
              <Chip href="/category/music">Музыка</Chip>
            </div>
          </section>

          <section className={styles.section}>
            <SectionTitle href="/list/top">Самый загружаемый</SectionTitle>
            <Rail label="Самый загружаемый">
              {tiles.map((tile) => (
                <div key={tile} className={styles.tile}>
                  {tile}
                </div>
              ))}
            </Rail>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
