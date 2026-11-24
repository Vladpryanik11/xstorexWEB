import { SectionTitle } from '@xstore/ui';
import { useId } from 'react';
import styles from './HowItWorks.module.css';

/** The three steps of the purchase (owner 2026-11-24 10:12): the same words in the window under the
 * first-screen button and in this section. `note` is shown in the window only. */
export const HOW_STEPS: { title: string; text: string; note?: string }[] = [
  {
    title: 'Оплатите подписку',
    text: 'Нужна только почта, без регистрации. Доступ ко всему каталогу начинается сразу.',
  },
  {
    title: 'Подключите iPhone',
    text: 'Откройте сайт в Safari и установите профиль: Настройки → «Профиль загружен» → «Установить». Без Apple ID и без компьютера.',
    note: 'Готовим iPhone обычно 2–3 часа в рабочее время, пришлём письмо.',
  },
  {
    title: 'Устанавливайте приложения',
    text: 'Нажмите «Установить» прямо на сайте, и приложение появится на экране «Домой».',
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
