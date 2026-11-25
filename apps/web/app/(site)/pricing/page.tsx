import { ApiClientError, type AppCard } from '@xstore/shared';
import type { Metadata } from 'next';
import { serverApi } from '../../../src/api/server';
import { HomeFaq, HomePlan } from '../../../src/home/HomeSell';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Тарифы',
  description: 'Один тариф: весь каталог приложений для iPhone на месяц.',
};

const questions = [
  [
    'Когда начнётся подписка?',
    'Сразу после оплаты. Срок — 1 месяц с момента, когда оплата подтвердилась.',
  ],
  [
    'Нужна ли регистрация?',
    'Нет. Достаточно почты: на неё придёт письмо об оплате и код для входа.',
  ],
  [
    'Можно ли оплатить с компьютера?',
    'Да. Оплатить и посмотреть свой доступ можно где угодно, а приложения ставятся на iPhone.',
  ],
] as const;

type Api = Awaited<ReturnType<typeof serverApi>>;

async function planPrice(api: Api): Promise<number | null> {
  try {
    return (await api.getPlan()).priceRub;
  } catch (err) {
    if (err instanceof ApiClientError && err.status < 500) return null;
    throw err;
  }
}

/** The icons on the card come from the catalog; the page still opens without them. */
async function sectionApps(api: Api, slug: 'removed' | 'premium'): Promise<AppCard[]> {
  return api
    .section(slug)
    .then((page) => page.items)
    .catch((): AppCard[] => []);
}

/** One plan, shown with the card and the questions of the home page (owner 2026-11-25, ПК 8). */
export default async function PricingPage() {
  const api = await serverApi();
  const [priceRub, removed, premium] = await Promise.all([
    planPrice(api),
    sectionApps(api, 'removed'),
    sectionApps(api, 'premium'),
  ]);
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Тарифы</h1>
        <p className={styles.lead}>Один тариф без выбора и мелкого шрифта.</p>
      </header>
      <HomePlan priceRub={priceRub} apps={[...removed, ...premium]} />
      <HomeFaq questions={questions} />
    </div>
  );
}
