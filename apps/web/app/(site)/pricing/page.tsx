import { ApiClientError, type PlanView } from '@xstore/shared';
import { Button } from '@xstore/ui';
import type { Metadata } from 'next';
import { serverApi } from '../../../src/api/server';
import { formatRub } from '../../../src/checkout/wizard-step';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Тарифы',
  description: 'Один тариф: весь каталог приложений для iPhone на месяц.',
};

const included = [
  'Все приложения каталога',
  'Установка прямо из Safari, без компьютера',
  'Один iPhone или iPad',
  'Новые версии приложений, пока действует доступ',
];

const questions = [
  {
    q: 'Когда начнётся подписка?',
    a: 'Сразу после оплаты. Срок — 1 месяц с момента, когда оплата подтвердилась.',
  },
  {
    q: 'Нужна ли регистрация?',
    a: 'Нет. Достаточно почты: на неё придёт письмо об оплате и код для входа.',
  },
  {
    q: 'Можно ли оплатить с компьютера?',
    a: 'Да. Оплатить и посмотреть свой доступ можно где угодно, а приложения ставятся на iPhone или iPad.',
  },
];

async function loadPlan(): Promise<PlanView | null> {
  try {
    return await (await serverApi()).getPlan();
  } catch (err) {
    if (err instanceof ApiClientError && err.status < 500) return null;
    throw err;
  }
}

export default async function PricingPage() {
  const plan = await loadPlan();
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Тарифы</h1>
        <p className={styles.lead}>Один тариф без выбора и мелкого шрифта.</p>
      </header>

      <section className={styles.card} aria-labelledby="plan-title">
        <h2 id="plan-title" className={styles.planTitle}>
          Доступ ко всему каталогу
        </h2>
        {plan ? (
          <p className={styles.price}>
            {formatRub(plan.priceRub)}
            <span className={styles.per}> за 1 месяц</span>
          </p>
        ) : (
          <p className={styles.lead}>Цена появится совсем скоро.</p>
        )}
        <ul className={styles.list}>
          {included.map((item) => (
            <li key={item} className={styles.item}>
              <svg
                className={styles.tick}
                width="18"
                height="18"
                viewBox="0 0 12 12"
                aria-hidden="true"
              >
                <path
                  d="m2.5 6.5 2.2 2.2L9.5 3.8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {item}
            </li>
          ))}
        </ul>
        <p className={styles.note}>Подписка начнётся сразу после оплаты.</p>
        <Button href="/get" disabled={!plan} className={styles.cta}>
          Оформить доступ
        </Button>
      </section>

      <section className={styles.faq} aria-labelledby="faq-title">
        <h2 id="faq-title" className={styles.faqTitle}>
          Частые вопросы
        </h2>
        {questions.map(({ q, a }) => (
          <details key={q} className={styles.question}>
            <summary className={styles.summary}>{q}</summary>
            <p className={styles.answer}>{a}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
