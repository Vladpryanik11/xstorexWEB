import { SectionTitle } from '@xstore/ui';
import { useId } from 'react';
import styles from './HowItWorks.module.css';

const steps = [
  { title: 'Найдите приложение', text: 'В каталоге есть и те, что пропали из App Store.' },
  { title: 'Оплатите', text: 'Без регистрации, сразу на сайте.' },
  { title: 'Установите', text: 'Приложение появится на вашем iPhone.' },
];

/** «Как это работает» at the end of the home page (spec 2026-11-17 §6). */
export function HowItWorks() {
  const id = useId();
  return (
    <section className={styles.section} aria-labelledby={id}>
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
