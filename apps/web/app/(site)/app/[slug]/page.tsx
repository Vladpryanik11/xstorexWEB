import type { AppDetail } from '@xstore/shared';
import {
  AppIcon,
  Button,
  FactsStrip,
  formatBytes,
  type InfoItem,
  InfoList,
  MoreText,
  Rail,
  SectionTitle,
  Stars,
} from '@xstore/ui';
import type { Metadata } from 'next';
import { orNotFound, serverApi } from '../../../../src/api/server';
import {
  appJsonLd,
  compatibility,
  inlineJson,
  languageFact,
  languageNames,
} from '../../../../src/app-page/app-facts';
import { installButtonState } from '../../../../src/app-page/install-button-state';
import { categoryHref } from '../../../../src/catalog/links';
import styles from './page.module.css';

type Props = { params: Promise<{ slug: string }> };

const loadApp = async (params: Props['params']): Promise<AppDetail> => {
  const { slug } = await params;
  return orNotFound((await serverApi()).app(slug));
};

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Moscow',
});

function summary(app: AppDetail): string {
  const text = app.subtitle ?? app.description ?? `${app.name} для iPhone`;
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const app = await loadApp(params);
  return {
    title: app.name,
    description: summary(app),
    openGraph: {
      title: app.name,
      description: summary(app),
      type: 'website',
      ...(app.iconUrl && { images: [{ url: app.iconUrl, alt: app.name }] }),
    },
  };
}

export default async function AppPage({ params }: Props) {
  const app = await loadApp(params);
  const install = installButtonState({
    signedIn: false,
    app: {
      slug: app.slug,
      accessLevel: app.accessLevel,
      // AppDetail exists only with a published version; encryption is checked on publishing.
      latestVersion: { encrypted: false },
    },
  });
  const size = formatBytes(app.sizeBytes);
  const minIos = compatibility(app.minIos);
  const info: InfoItem[] = [
    ...(app.developer ? [{ label: 'Разработчик', value: app.developer }] : []),
    { label: 'Размер', value: size },
    ...(app.category
      ? [
          {
            label: 'Категория',
            value: (
              <a className={styles.infoLink} href={categoryHref(app.category.slug)}>
                {app.category.name}
              </a>
            ),
          },
        ]
      : []),
    ...(minIos ? [{ label: 'Совместимость', value: minIos }] : []),
    ...(app.languages.length > 0 ? [{ label: 'Языки', value: languageNames(app.languages) }] : []),
    { label: 'Версия', value: app.version },
  ];

  return (
    <article className={styles.page}>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON with `<` escaped (inlineJson)
        dangerouslySetInnerHTML={{ __html: inlineJson(appJsonLd(app)) }}
      />
      <header className={styles.head}>
        <AppIcon src={app.iconUrl} alt={`Иконка ${app.name}`} size={120} />
        <div className={styles.headText}>
          <h1 className={styles.name}>{app.name}</h1>
          {app.subtitle ? <p className={styles.subtitle}>{app.subtitle}</p> : null}
          {app.removedFromAppStore ? <p className={styles.badge}>Удалено из App Store</p> : null}
          {app.rating !== undefined && app.ratingCount ? (
            <Stars value={app.rating} count={app.ratingCount} />
          ) : null}
          <div className={styles.action}>
            {install.href ? (
              <Button href={install.href}>{install.label}</Button>
            ) : (
              <Button disabled>{install.label}</Button>
            )}
          </div>
        </div>
      </header>

      <FactsStrip
        facts={[
          { label: 'Категория', value: app.category?.name ?? '—' },
          { label: 'Разработчик', value: app.developer ?? '—' },
          { label: 'Язык', value: languageFact(app.languages) },
          { label: 'Размер', value: size },
          { label: 'Версия', value: app.version },
        ]}
      />

      {app.screenshots.length > 0 ? (
        <section className={styles.section}>
          <SectionTitle>Скриншоты</SectionTitle>
          <Rail label="Скриншоты">
            {app.screenshots.map((src, i) => (
              // biome-ignore lint/performance/noImgElement: media come from object storage as is
              <img
                key={src}
                className={styles.shot}
                src={src}
                alt={`Скриншот ${i + 1}: ${app.name}`}
                loading="lazy"
                decoding="async"
              />
            ))}
          </Rail>
        </section>
      ) : null}

      {app.description ? (
        <section className={`${styles.section} ${styles.padded}`}>
          <SectionTitle>Описание</SectionTitle>
          <MoreText text={app.description} />
        </section>
      ) : null}

      <section className={styles.section}>
        <SectionTitle>Информация</SectionTitle>
        <InfoList items={info} />
      </section>

      <section className={`${styles.section} ${styles.padded}`}>
        <SectionTitle>История версий</SectionTitle>
        <ol className={styles.versions}>
          {app.versions.map((v) => (
            <li key={`${v.version}-${v.build}`} className={styles.version}>
              <div className={styles.versionHead}>
                <span className={styles.versionName}>Версия {v.version}</span>
                <time className={styles.versionDate} dateTime={v.publishedAt}>
                  {dateFormat.format(new Date(v.publishedAt))}
                </time>
              </div>
              {v.changelog ? <p className={styles.changelog}>{v.changelog}</p> : null}
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
