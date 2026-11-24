import { useId } from 'react';
import { formatRub } from '../checkout/wizard-step';
import { APPS, AUDIENCE } from './figures';
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

const STATS = [
  [APPS, 'приложений'],
  [AUDIENCE, 'пользователей в месяц'],
  ['0 ₽', 'доплат по гарантии'],
];

/** Row of figures between the search and «Как это работает» (owner 2026-11-21). */
export function HomeStats() {
  return (
    <div className={styles.statsWrap}>
      <ul className={styles.stats} aria-label="Xstorex в цифрах">
        {STATS.map(([n, t]) => (
          <li key={t} className={styles.stat}>
            <b>{n}</b> <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const REASONS = [
  [
    'То, что удалили из App Store',
    'Приложения, которые больше нигде не скачать, ставятся как раньше.',
  ],
  [
    'Без лишних программ и аккаунтов',
    'Всё работает в Safari. Не нужно ставить ещё одно приложение или давать нам Apple ID.',
  ],
  [
    'Только честные копии',
    'У каждого приложения есть право на распространение. Никаких взломов и модов с вирусами.',
  ],
  ['Живые люди в поддержке', 'Перестало открываться? Напишите нам, восстановим без доплаты.'],
];

export function HomeWhy() {
  const id = useId();
  return (
    <section className={styles.block} aria-labelledby={id}>
      <h2 id={id} className={styles.title}>
        Почему Xstorex
      </h2>
      <ul className={styles.why}>
        {REASONS.map(([t, p]) => (
          <li key={t}>
            <h3>{t}</h3>
            <p>{p}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

const QUESTIONS = [
  [
    'Это не взлом? С iPhone ничего не случится?',
    'Нет. iPhone не взламываем, Apple ID не просим. Приложения ставятся тем же способом, каким компании раздают программы своим сотрудникам.',
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

export function HomeFinal({ priceRub }: Price) {
  const id = useId();
  return (
    <section className={styles.finalWrap} aria-labelledby={id}>
      <div className={styles.final}>
        <div>
          <h2 id={id}>Ваши приложения уже ждут</h2>
          <p>
            {priceRub !== null
              ? `Весь каталог за ${formatRub(priceRub)} в месяц. Гарантия на весь срок подписки.`
              : 'Весь каталог в одной подписке. Гарантия на весь срок подписки.'}
          </p>
        </div>
        <Cta priceRub={priceRub} light />
      </div>
    </section>
  );
}
