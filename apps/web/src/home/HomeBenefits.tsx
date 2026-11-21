import { useId } from 'react';
import styles from './HomeBenefits.module.css';

const ITEMS = [
  {
    title: 'Нет в App Store',
    text: 'Банки, сервисы, игры',
    icon: 'M13 3L5 14h6l-1 7 8-11h-6l1-7z',
  },
  {
    title: 'Premium включён',
    text: 'Все функции открыты',
    icon: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  },
  {
    title: 'Безопасно',
    text: 'Установка из Safari',
    icon: 'M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3zM9 12l2 2 4-4',
  },
  {
    title: 'Пара нажатий',
    text: 'Без компьютера',
    icon: 'M9.5 3h5A2.5 2.5 0 0 1 17 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-5A2.5 2.5 0 0 1 7 18.5v-13A2.5 2.5 0 0 1 9.5 3zM11 18h2',
  },
];

/** Benefits panel under the home hero (spec v2 §3.1). */
export function HomeBenefits() {
  const id = useId();
  return (
    <section className={styles.panel} aria-labelledby={id}>
      <h2 id={id} className={styles.hidden}>
        Преимущества Xstorex
      </h2>
      <ul className={styles.list}>
        {ITEMS.map((item) => (
          <li key={item.title} className={styles.item}>
            <span className={styles.icon} aria-hidden="true">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d={item.icon} />
              </svg>
            </span>
            <h3 className={styles.title}>{item.title}</h3>
            <p className={styles.text}>{item.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
