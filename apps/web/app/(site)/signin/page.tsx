import { errorMessages, safeNext } from '@xstore/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { serverApi } from '../../../src/api/server';
import { SigninForm } from '../../../src/auth/SigninForm';
import styles from '../../../src/checkout/checkout.module.css';
import connect from '../../../src/checkout/connect.module.css';

export const metadata: Metadata = {
  title: 'Вход',
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Whether the visitor already has a buyer session; an unreachable API shows the form. */
async function signedIn(): Promise<boolean> {
  try {
    const access = await (await serverApi()).getAccess();
    // `email` and `hasPassword` come only with a buyer session.
    return access.hasPassword !== undefined;
  } catch {
    return false;
  }
}

/** `/signin?next=`: email and password, or a code from the email. */
export default async function SigninPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const next = one(params.next);
  const handoffExpired = one(params.handoff) === 'expired';
  // Outside the try in `signedIn`: `redirect` works by throwing.
  if (await signedIn()) redirect(safeNext(next, '/access'));
  return (
    <div className={styles.wizard}>
      <section className={styles.panel} aria-labelledby="signin-title">
        <h1 id="signin-title" className={styles.title}>
          Вход
        </h1>
        {handoffExpired ? (
          <p className={connect.notice} role="status">
            {errorMessages.HANDOFF_INVALID}
          </p>
        ) : null}
        <p className={styles.lead}>
          По почте, которую вы указали при оплате. Нет пароля — войдите по коду из письма.
        </p>
        <SigninForm next={next} />
      </section>
    </div>
  );
}
