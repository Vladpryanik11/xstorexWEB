import type { CollectionView } from '@xstore/shared';
import { useId } from 'react';
import { AUDIENCE } from './figures';
import { HeroIcons } from './HeroIcons';
import { HeroPhone } from './HeroPhone';
import styles from './HomeHero.module.css';

const BENEFITS = [
  {
    title: 'Удалённые из App Store',
    text: 'Банки и сервисы, которых больше нет в магазине',
    icon: 'M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13',
  },
  {
    title: 'Premium‑доступы',
    text: 'Платные функции приложений уже включены',
    icon: 'M4 8l4 4 4-7 4 7 4-4-2 10H6L4 8z',
  },
  {
    title: 'Проверенные сертификаты',
    text: 'Безопасная установка прямо из Safari',
    icon: 'M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3zM9 12l2 2 4-4',
  },
];

/**
 * Home hero that sells the subscription (spec v2 §3.1). Phone order (owner 2026-11-21): promise,
 * icon row, button, guarantee, audience.
 */
export function HomeHero({ collections }: { collections: CollectionView[] }) {
  const listId = useId();
  return (
    <section className={styles.hero} data-home-hero>
      <div className={styles.inner}>
        <div className={styles.copy}>
          <h1 className={styles.title}>
            <span className={styles.accent}>200+</span> приложений{' '}
            <span className={styles.wide}>с&nbsp;Premium‑доступом</span> на&nbsp;вашем&nbsp;iPhone
          </h1>
          <p className={styles.sub}>
            <span className={styles.subLead}>Даже удалённые из App Store.</span>{' '}
            <span>Premium уже включён.</span>
          </p>
          <span id={listId} hidden>
            Что входит в подписку
          </span>
          <ul className={styles.benefits} aria-labelledby={listId}>
            {BENEFITS.map((b) => (
              <li key={b.title} className={styles.benefit}>
                <span className={styles.icon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d={b.icon} />
                  </svg>
                </span>
                <span>
                  <b className={styles.benefitTitle}>{b.title}</b>
                  <span className={styles.benefitText}>{b.text}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className={styles.stage}>
            <HeroIcons collections={collections} />
          </div>
          <a className={styles.cta} href="/get" data-hero-cta>
            Подключить iPhone
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
          <p className={styles.trust}>
            <span className={styles.check} aria-hidden="true">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M6 12.5l4 4 8-9" />
              </svg>
            </span>
            Гарантия на весь срок подписки
          </p>
          <div className={styles.audience}>
            <span className={styles.avatars} aria-hidden="true">
              <span>А</span>
              <span>М</span>
              <span>Д</span>
              <span>+</span>
            </span>
            <span>
              <b className={styles.audienceNum}>{AUDIENCE}</b>
              <span className={styles.audienceText}>пользователей в месяц</span>
            </span>
          </div>
        </div>
        <div className={styles.visual} aria-hidden="true">
          <span className={styles.rings} />
          <HeroPhone collections={collections} />
        </div>
      </div>
    </section>
  );
}
