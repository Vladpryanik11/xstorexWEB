import { useId } from 'react';
import { formatRub } from '../checkout/wizard-step';
import { AUDIENCE } from './figures';
import styles from './HomeSell.module.css';

/*
 * Selling blocks of the home page below the hero (spec v2 §3.1, mockup
 * https://claude.ai/artifact/TxU9src8Q2bY7bBRV63fSh). Only promises the owner confirmed:
 * the guarantee for the whole subscription. Buttons carry data-page-cta so the phone sticky
 * button hides while one of them is on screen.
 */

type Price = { priceRub: number | null };

function Cta({ priceRub, light }: Price & { light?: boolean }) {
  return (
    <a className={light ? styles.ctaLight : styles.cta} href="/get" data-page-cta="">
      {priceRub === null ? 'Подключить iPhone' : `Получить доступ за ${formatRub(priceRub)}`}
    </a>
  );
}

const INCLUDED = [
  ['Безлимит.', 'Ставьте любые приложения каталога, сколько захотите'],
  ['Ваше устройство.', 'Один iPhone на подписку'],
  ['Гарантия до последнего дня.', 'Что‑то перестало открываться — вернём доступ за наш счёт'],
];

export function HomePlan({ priceRub }: Price) {
  const id = useId();
  return (
    <section className={styles.planWrap} aria-labelledby={id}>
      <div className={styles.plan}>
        <h2 id={id} className={styles.eyebrow}>
          Весь каталог на 1 месяц
        </h2>
        {priceRub !== null ? (
          <p className={styles.price}>
            {formatRub(priceRub)} <span>в месяц</span>
          </p>
        ) : null}
        <ul className={styles.included}>
          {INCLUDED.map(([b, t]) => (
            <li key={b}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M6 12.5l4 4 8-9" />
              </svg>
              <span>
                <b>{b}</b> {t}
              </span>
            </li>
          ))}
        </ul>
        <Cta priceRub={priceRub} light />
        <p className={styles.proof}>
          <b>{AUDIENCE}</b> пользователей в месяц
        </p>
      </div>
    </section>
  );
}

/** Owner 2026-11-24 12:20–12:29 (home variant Б): the first question says why it is safe, in the
 * words of the «Как это работает» window; the reasons of the removed «Почему Xstorex» became the
 * last three questions. */
const QUESTIONS = [
  [
    'Это безопасно?',
    'Да. Доступа к iPhone у нас нет: фото, сообщения, пароли и Apple ID мы не видим. Приложения подписаны официальным сертификатом разработчика Apple. Профиль и режим разработчика — обычные настройки Apple, удалить или выключить их можно в любой момент. Ставим только официальные файлы приложений, без сторонних программ и взломанных версий.',
  ],
  [
    'А если приложение перестанет открываться?',
    'Напишите нам. Восстановим доступ бесплатно, пока действует подписка.',
  ],
  [
    'Нужна ли регистрация?',
    'Нет. Достаточно почты: на неё придёт письмо об оплате и код для входа.',
  ],
  [
    'Мне нужен компьютер?',
    'Нет. Оплатить можно с любого устройства, а приложения ставятся на iPhone.',
  ],
  [
    'Что если приложение удалили из App Store?',
    'Оно остаётся в нашем каталоге. Ставите его с сайта, как раньше.',
  ],
  [
    'Сколько ждать после подключения iPhone?',
    'Обычно 2–3 часа в рабочее время. Когда всё готово, придёт письмо.',
  ],
  ['Как связаться с поддержкой?', 'Напишите нам на почту. Отвечаем в рабочие часы.'],
];

export function HomeFaq() {
  const id = useId();
  return (
    <section className={styles.block} aria-labelledby={id}>
      <h2 id={id} className={styles.title}>
        Частые вопросы
      </h2>
      <div className={styles.faq}>
        {QUESTIONS.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
