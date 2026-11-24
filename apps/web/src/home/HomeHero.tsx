import type { CollectionView } from '@xstore/shared';
import { useId } from 'react';
import { HeroFinder, type HeroLaneApps } from './HeroFinder';
import { HeroPhone } from './HeroPhone';
import styles from './HomeHero.module.css';
import { HowSheet } from './HowSheet';

/** Line icons for the three promises, drawn for Xstorex (no Apple logo; a plain shield, no check). */
const PROMISES = [
  {
    text: ['Без входа', 'в Apple ID'],
    icon: (
      <>
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5 19.5c1.2-3.3 3.9-5 7-5s5.8 1.7 7 5" />
      </>
    ),
  },
  {
    text: ['Без', 'компьютера'],
    icon: (
      <>
        <rect x="4" y="5.5" width="16" height="10.5" rx="1.8" />
        <path d="M2.5 18.5h19" />
      </>
    ),
  },
  {
    text: ['Гарантия', 'на весь срок'],
    icon: <path d="M12 3.2 5 6v5.6c0 4.3 3 7.8 7 9.2 4-1.4 7-4.9 7-9.2V6z" />,
  },
];

/** Three drawn faces in the audience line, each head whole inside its circle (owner 2026-11-24 09:24). */
const AVATARS = ['/home/avatars/1.svg', '/home/avatars/2.svg', '/home/avatars/3.svg'];

export type { HeroLaneApps };

/**
 * First screen of the home page (spec 2026-11-23-home-first-screen, owner 2026-11-22/23):
 * promise on a bright sky with white text, two edge-to-edge lanes of removed and premium apps,
 * search, the «Подключить iPhone» button, three promises and the audience (owner 2026-11-24: the
 * three steps left the first screen; «Как это работает» further down keeps them).
 */
export function HomeHero({
  collections,
  lanes,
}: {
  collections: CollectionView[];
  lanes: HeroLaneApps;
}) {
  const promisesId = useId();
  return (
    <section className={styles.hero} data-home-hero>
      <div className={styles.inner}>
        <div className={styles.sky} aria-hidden="true" data-hero-sky="" />
        <h1 className={styles.title}>Удаленные из App&nbsp;Store снова доступны</h1>
        {/* Owner 2026-11-24: the same words in three lines, without the dash. */}
        <p className={styles.sub} data-hero-sub="">
          Премиум подписки на музыку,
          <br />
          фоторедакторы, платные игры
          <br />
          уже в подписке
        </p>
        <HeroFinder lanes={lanes} lanesClassName={styles.lanes} searchClassName={styles.search} />
        <a className={styles.cta} href="/get" data-hero-cta>
          Подключить iPhone
        </a>
        {/* Owner 2026-11-24 09:11–09:12: a small blue question right under the button; it opens the
            steps over the page. */}
        <HowSheet className={styles.how} />
        <span id={promisesId} hidden>
          Без лишнего
        </span>
        <ul className={styles.promises} aria-labelledby={promisesId}>
          {PROMISES.map((p) => (
            <li key={p.text.join(' ')} className={styles.promise}>
              <svg
                className={styles.promiseIcon}
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                {p.icon}
              </svg>
              <span>
                {p.text[0]} <br />
                {p.text[1]}
              </span>
            </li>
          ))}
        </ul>
        <div className={styles.visual} aria-hidden="true">
          <HeroPhone collections={collections} />
        </div>
      </div>
      <div className={styles.after}>
        <p className={styles.audience} data-hero-audience="">
          <span className={styles.avatars} aria-hidden="true">
            {AVATARS.map((src) => (
              // biome-ignore lint/performance/noImgElement: three 26px static drawings, 1.5 KB each
              <img key={src} src={src} alt="" width={26} height={26} data-avatar="" />
            ))}
          </span>
          <span>
            Более <b className={styles.audienceNum}>10 000</b> пользователей в&nbsp;месяц
          </span>
        </p>
      </div>
    </section>
  );
}
