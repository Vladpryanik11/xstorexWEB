import type { AppCard } from '@xstore/shared';
import { useId } from 'react';
import { formatRub } from '../checkout/wizard-step';
import { APPS } from './figures';
import styles from './HomeSell.module.css';

/*
 * Selling blocks of the home page below the hero (spec v2 §3.1, mockup
 * https://claude.ai/artifact/TxU9src8Q2bY7bBRV63fSh). Only promises the owner confirmed:
 * the guarantee for the whole subscription. Buttons carry data-page-cta so the phone sticky
 * button hides while one of them is on screen.
 */

type Price = { priceRub: number | null };

function Cta({ priceRub, light }: Price & { light?: boolean }) {
  // Owner 2026-11-24 13:57, variant Б: the price is said once, on the button.
  return (
    <a className={light ? styles.ctaLight : styles.cta} href="/get" data-page-cta="">
      {priceRub === null ? (
        'Подключить iPhone'
      ) : (
        <>
          {formatRub(priceRub)} <span className={styles.per}>/ мес.</span>
        </>
      )}
    </a>
  );
}

// Owner 2026-11-24 13:08 (variant 2 «Только главное») and 13:12 (variant Г): three short points
// as pills in a row; the explanations live in the questions below.
const INCLUDED = ['Безлимит', '1 iPhone', 'Гарантия'];

/** Icons in the row of the plan card (owner 2026-11-24 14:04, variant Г). */
const ICONS = 5;

/**
 * Owner 2026-11-24 14:04, variant Г «Слова + иконки»: the title says it is one subscription, a row
 * of real catalog icons (the apps of the hero lanes) and the size of the catalog show what is in
 * it. Without icons the row is not drawn.
 */
export function HomePlan({ priceRub, apps }: Price & { apps: AppCard[] }) {
  const id = useId();
  // An app can sit in both sections of the lanes; its icon is shown once.
  const seen = new Set<string>();
  const icons = apps
    .filter((a) => a.iconUrl && !seen.has(a.slug) && seen.add(a.slug))
    .slice(0, ICONS);
  return (
    <section className={styles.planWrap} aria-labelledby={id}>
      <div className={styles.plan}>
        <h2 id={id} className={styles.planTitle}>
          Весь каталог в одной подписке
        </h2>
        {icons.length > 0 ? (
          <ul className={styles.icons} aria-label="Приложения каталога">
            {icons.map((a) => (
              <li key={a.slug}>
                {/* biome-ignore lint/performance/noImgElement: small catalog icons from S3 */}
                <img src={a.iconUrl ?? ''} alt="" width={34} height={34} loading="lazy" />
              </li>
            ))}
            <li className={styles.more}>+{APPS.replace('+', '')}</li>
          </ul>
        ) : null}
        <ul className={styles.included}>
          {INCLUDED.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <Cta priceRub={priceRub} light />
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
