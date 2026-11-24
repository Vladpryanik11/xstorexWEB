import { SectionTitle } from '@xstore/ui';
import { useId } from 'react';
import styles from './HowItWorks.module.css';

/** The steps after the payment (owner 2026-11-24 10:12–10:30; 10:41 the wait for the email became
 * the fourth point of «Подключите iPhone»): the same titles and texts in the
 * window under the first-screen button and in this section. `how` (a short instruction, point by
 * point) and `note` are shown in the window only. */
export const HOW_STEPS: {
  title: string;
  text: string;
  how?: string[];
  note?: string;
  /** Why the step is safe (owner 2026-11-24 10:34), shown in the window. */
  safe?: string;
}[] = [
  {
    title: 'Оплатите подписку',
    text: 'Нужна только почта, без регистрации.',
    how: ['Нажмите «Подключить iPhone»', 'Введите почту и оплатите'],
  },
  {
    title: 'Включите режим разработчика',
    text: 'Это нужно один раз.',
    how: [
      'Настройки → Конфиденциальность и безопасность',
      '«Режим разработчика» → включите',
      'После перезагрузки нажмите «Включить»',
    ],
    safe: 'Это встроенная настройка Apple. Доступа к вашему iPhone она нам не даёт, выключить её можно там же.',
  },
  {
    title: 'Подключите iPhone',
    text: 'Установите профиль, так мы узнаем ваш iPhone.',
    how: [
      'Откройте сайт в Safari и нажмите «Подключить iPhone»',
      'Настройки → «Профиль загружен»',
      'Нажмите «Установить»',
      'Дождитесь письма о готовности: обычно 2–3 часа в рабочее время',
    ],
    safe: 'Профиль передаёт только модель iPhone, версию iOS и номер устройства. Фото, сообщения, пароли и Apple ID нам не видны.',
  },
  {
    title: 'Устанавливайте приложения',
    text: 'Нажмите «Установить» у любого приложения на сайте.',
    note: 'Приложения подписаны сертификатом разработчика Apple для вашего iPhone, поэтому ставятся без App Store и Apple ID.',
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
