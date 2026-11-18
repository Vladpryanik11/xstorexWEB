import { Button } from '@xstore/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteShell } from '../../../../src/shell/SiteShell';
import { settleFakePayment } from './actions';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Тестовая оплата',
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Development stand-in for the payment page of the fake provider. 404 without XSTORE_DEV_PAGES=1. */
export default async function DevPayPage({ params, searchParams }: Props) {
  if (process.env.XSTORE_DEV_PAGES !== '1') notFound();
  const { id } = await params;
  const failed = (await searchParams).error === '1';
  return (
    <SiteShell>
      <section className={styles.page}>
        <span className={styles.badge}>Только для разработки</span>
        <h1 className={styles.title}>Тестовая оплата</h1>
        <p className={styles.text}>Деньги не списываются. Выберите, чем закончится платёж.</p>
        {failed ? (
          <p role="alert" className={styles.error}>
            Не получилось провести тестовый платёж. Проверьте, что сервер запущен, и попробуйте ещё
            раз.
          </p>
        ) : null}
        <form className={styles.actions}>
          <Button type="submit" formAction={settleFakePayment.bind(null, id, 'pay')}>
            Оплатить
          </Button>
          <Button
            type="submit"
            variant="quiet"
            formAction={settleFakePayment.bind(null, id, 'fail')}
          >
            Отказать
          </Button>
        </form>
      </section>
    </SiteShell>
  );
}
