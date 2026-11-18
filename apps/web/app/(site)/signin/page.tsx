import type { Metadata } from 'next';
import { SigninForm } from '../../../src/auth/SigninForm';
import styles from '../../../src/checkout/checkout.module.css';

export const metadata: Metadata = {
  title: 'Вход',
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** `/signin?next=`: email and password, or a code from the email. */
export default async function SigninPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const next = one((await searchParams).next);
  return (
    <div className={styles.wizard}>
      <section className={styles.panel} aria-labelledby="signin-title">
        <h1 id="signin-title" className={styles.title}>
          Вход
        </h1>
        <p className={styles.lead}>
          По почте, которую вы указали при оплате. Нет пароля — войдите по коду из письма.
        </p>
        <SigninForm next={next} />
      </section>
    </div>
  );
}
