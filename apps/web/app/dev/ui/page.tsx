import {
  AppIcon,
  AppRow,
  Button,
  Chip,
  Cover,
  FactsStrip,
  formatBytes,
  formatRating,
  IconTile,
  InfoList,
  InstallBanner,
  MoreText,
  Rail,
  RowsGrid,
  SearchField,
  SectionTitle,
  SpotBanner,
  Stars,
} from '@xstore/ui';
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
  const apps = Array.from({ length: 9 }, (_, i) => ({
    slug: `app-${i + 1}`,
    name: i === 1 ? 'Приложение с очень длинным названием для проверки' : `Приложение ${i + 1}`,
    subtitle: i % 2 ? 'Утилиты' : 'Игры',
  }));
  const description =
    'Описание приложения для проверки сворачивания текста.\nВторая строка описания.\n' +
    'Третья строка описания.\nЧетвёртая строка, которая видна только после нажатия «ещё».\n' +
    'Пятая строка.';

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

          <section className={styles.section}>
            <SectionTitle>Иконки приложений</SectionTitle>
            <div className={styles.row}>
              <AppIcon alt="Без картинки" size={56} />
              <AppIcon src="/brand/mark.svg" alt="Xstore" size={76} />
              <AppIcon src="/brand/mark.svg" alt="Xstore" size={120} />
            </div>
          </section>

          <section className={styles.section}>
            <SectionTitle>Баннеры</SectionTitle>
            <Rail label="Баннеры">
              {[
                <SpotBanner
                  key="a"
                  href="/list/new"
                  title="Новинки недели"
                  subtitle="Свежие приложения"
                />,
                <SpotBanner key="b" href="/list/removed" title="Удалённые из App Store" />,
              ]}
            </Rail>
          </section>

          <section className={styles.section}>
            <SectionTitle href="/list/top">Сетка 3×N</SectionTitle>
            <RowsGrid label="Сетка 3×N">
              {apps.map((app) => (
                <AppRow
                  key={app.slug}
                  href={`/app/${app.slug}`}
                  name={app.name}
                  subtitle={app.subtitle}
                />
              ))}
            </RowsGrid>
          </section>

          <section className={styles.section}>
            <SectionTitle href="/list/trends">Иконки</SectionTitle>
            <Rail label="Иконки">
              {apps.map((app) => (
                <IconTile key={app.slug} href={`/app/${app.slug}`} name={app.name} />
              ))}
            </Rail>
          </section>

          <section className={styles.section}>
            <SectionTitle>Обложки</SectionTitle>
            <Rail label="Обложки">
              {apps.slice(0, 4).map((app) => (
                <div key={app.slug} className={styles.coverItem}>
                  <Cover alt={`Скриншот: ${app.name}`} />
                  <AppRow href={`/app/${app.slug}`} name={app.name} subtitle={app.subtitle} />
                </div>
              ))}
            </Rail>
          </section>

          <section className={styles.section}>
            <SectionTitle>Рейтинг</SectionTitle>
            <div className={styles.row}>
              <Stars value={4.5} count={1234} />
              <Stars value={3.2} />
              <span>
                {formatRating(4.46)} · {formatBytes(1_288_490_189)} · {formatBytes(850 * 1024 ** 2)}
              </span>
            </div>
          </section>

          <section className={styles.section}>
            <SectionTitle>Факты</SectionTitle>
            <FactsStrip
              facts={[
                { label: 'Категория', value: 'Игры' },
                { label: 'Разработчик', value: 'Студия' },
                { label: 'Язык', value: 'Русский' },
                { label: 'Размер', value: formatBytes(1_288_490_189) },
                { label: 'Версия', value: '2.4.1' },
              ]}
            />
          </section>

          <section className={styles.section}>
            <SectionTitle>Описание</SectionTitle>
            <div className={styles.pad}>
              <MoreText text={description} />
            </div>
          </section>

          <section className={styles.section}>
            <SectionTitle>Информация</SectionTitle>
            <InfoList
              items={[
                { label: 'Разработчик', value: 'Студия' },
                { label: 'Размер', value: formatBytes(1_288_490_189) },
                { label: 'Совместимость', value: 'iOS 15.0 и новее' },
                { label: 'Версия', value: '2.4.1' },
              ]}
            />
          </section>
        </div>
      </main>
      <InstallBanner href="/install" />
      <Footer />
    </>
  );
}
