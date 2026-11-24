import { SectionTitle } from '@xstore/ui';
import { useId } from 'react';
import styles from './HowItWorks.module.css';

/** The steps after the payment (owner 2026-11-24 10:12–10:30), shown in this section. The window
 * under the first-screen button explains the service itself (HowSheet, owner 2026-11-24). */
export const HOW_STEPS: { title: string; text: string }[] = [
  { title: 'Оплатите подписку', text: 'Нужна только почта, без регистрации.' },
  { title: 'Включите режим разработчика', text: 'Это нужно один раз.' },
  {
    title: 'Подключите iPhone',
    text: 'Профиль нужен, чтобы приложения работали на вашем iPhone.',
  },
  {
    title: 'Устанавливайте приложения',
    text: 'Нажмите «Установить» у любого приложения на сайте.',
  },
];

/** «Как это работает» on the home page, before the reasons and the plan (spec v2 §3.1, owner 2026-11-21). */
export function HowItWorks() {
  const id = useId();
  return (
    <section id="how" className={styles.section} aria-labelledby={id}>
      <div id={id}>
        <SectionTitle>Как это работает</SectionTitle>
      </div>
      <ol className={styles.steps}>
        {HOW_STEPS.map((step, i) => (
          <li key={step.title} className={styles.step}>
            <span className={styles.number} aria-hidden="true">
              {i + 1}
            </span>
            <h3 className={styles.title}>{step.title}</h3>
            <p className={styles.text}>{step.text}</p>
          </li>
        ))}
      </ol>
      <p className={styles.trust}>
        Только приложения с правами на распространение. Никаких взломанных версий.
      </p>
    </section>
  );
}
