import type { AppCard, CollectionView } from '@xstore/shared';
import { SearchField } from '@xstore/ui';
import { useId } from 'react';
import { HeroLanes } from './HeroLanes';
import { HeroPhone } from './HeroPhone';
import styles from './HomeHero.module.css';

const STEPS = ['Подключи', 'Активируй', 'Скачивай'];

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

/** Monogram avatars, like contacts without a photo on iPhone. */
const AVATARS = ['А', 'М', 'Д'];

export type HeroLaneApps = { removed: AppCard[]; premium: AppCard[] };

/**
 * First screen of the home page (spec 2026-11-23-home-first-screen, owner 2026-11-22/23):
 * promise on a bright sky with white text, two edge-to-edge lanes of removed and premium apps,
 * search, the «Подключить iPhone» button, three promises and the audience; the three steps
 * follow right under the first screen.
 */
export function HomeHero({
  collections,
  lanes,
}: {
  collections: CollectionView[];
  lanes: HeroLaneApps;
}) {
  const promisesId = useId();
  const stepsId = useId();
  return (
    <section className={styles.hero} data-home-hero>
      <div className={styles.inner}>
        <div className={styles.sky} aria-hidden="true" data-hero-sky="" />
        <h1 className={styles.title}>Удаленные из App&nbsp;Store снова доступны</h1>
        <p className={styles.sub}>
          Премиум подписки на музыку, фоторедакторы, платные игры — уже в подписке
        </p>
        <div className={styles.lanes}>
          <HeroLanes removed={lanes.removed} premium={lanes.premium} />
        </div>
        <div className={styles.search}>
          <SearchField action="/search" placeholder="Найти свое приложение" />
        </div>
        <a className={styles.cta} href="/get" data-hero-cta>
          Подключить iPhone
        </a>
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
            {AVATARS.map((a) => (
              <span key={a} data-avatar="">
                {a}
              </span>
            ))}
          </span>
          <span>
            Более <b className={styles.audienceNum}>10 000</b> пользователей в&nbsp;месяц
          </span>
        </p>
        <span id={stepsId} hidden>
          Три шага
        </span>
        <ol className={styles.steps} aria-labelledby={stepsId}>
          {STEPS.map((s, i) => (
            <li key={s} className={styles.step}>
              <b className={styles.num}>{i + 1}</b>
              {s}
            </li>
          ))}
        </ol>
        <p className={styles.site}>Установка прямо с сайта</p>
      </div>
    </section>
  );
}
