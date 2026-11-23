import type { CollectionView } from '@xstore/shared';
import { SearchField } from '@xstore/ui';
import { useId } from 'react';
import { AUDIENCE } from './figures';
import { HeroIcons } from './HeroIcons';
import { HeroPhone } from './HeroPhone';
import styles from './HomeHero.module.css';

const TICKS = ['Без входа в Apple ID', 'Без компьютера'];
const STEPS = ['Подключи', 'Активируй', 'Скачивай'];

function Tick() {
  return (
    <svg className={styles.tick} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

/**
 * First screen of the home page (spec 2026-11-23-home-first-screen, owner 2026-11-22/23):
 * promise on a bright sky with white text, two ticks, the motion banner slot (real catalog icons
 * until the motion is chosen), search, the «Подключить iPhone» button, the guarantee and the
 * audience; the three steps follow right under the first screen.
 */
export function HomeHero({ collections }: { collections: CollectionView[] }) {
  const ticksId = useId();
  const stepsId = useId();
  return (
    <section className={styles.hero} data-home-hero>
      <div className={styles.inner}>
        <div className={styles.sky} aria-hidden="true" data-hero-sky="" />
        <h1 className={styles.title}>Удаленные из App&nbsp;Store снова доступны</h1>
        <p className={styles.sub}>
          Премиум подписки на музыку, фоторедакторы, платные игры — уже в подписке
        </p>
        <span id={ticksId} hidden>
          Без лишнего
        </span>
        <ul className={styles.ticks} aria-labelledby={ticksId}>
          {TICKS.map((t) => (
            <li key={t}>
              <Tick />
              {t}
            </li>
          ))}
        </ul>
        <div className={styles.banner} aria-hidden="true" data-hero-banner="">
          <HeroIcons collections={collections} />
        </div>
        <div className={styles.search}>
          <SearchField action="/search" placeholder="Найти свое приложение" />
        </div>
        <a className={styles.cta} href="/get" data-hero-cta>
          Подключить iPhone
        </a>
        <p className={styles.guarantee}>
          <Tick />
          Гарантия на весь срок подписки
        </p>
        <div className={styles.visual} aria-hidden="true">
          <HeroPhone collections={collections} />
        </div>
      </div>
      <div className={styles.after}>
        <div className={styles.audience}>
          <span className={styles.avatars} aria-hidden="true">
            <span>А</span>
            <span>М</span>
            <span>Д</span>
            <span>+</span>
          </span>
          <span>
            <b className={styles.audienceNum}>{AUDIENCE}</b>{' '}
            <span className={styles.audienceText}>пользователей в месяц</span>
          </span>
        </div>
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
