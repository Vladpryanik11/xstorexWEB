import { SectionTitle } from '@xstore/ui';
import { useId } from 'react';
import styles from './HowItWorks.module.css';

const steps = [
  { title: 'Оплатите', text: 'Без регистрации, за минуту.' },
  { title: 'Подключите iPhone', text: 'Один раз, прямо с телефона.' },
  { title: 'Установите', text: 'Любые приложения каталога.' },
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
        {steps.map((step, i) => (
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
