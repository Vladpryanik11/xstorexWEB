import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AccessCard } from '../../../src/access/AccessCard';
import { serverApi } from '../../../src/api/server';
import styles from '../../../src/checkout/checkout.module.css';

export const metadata: Metadata = {
  title: 'Мой доступ',
  robots: { index: false, follow: false },
};

/** «Мой доступ» (spec v2 §5). Works on a computer too; a guest is sent to sign in first. */
export default async function AccessPage() {
  const api = await serverApi();
  const access = await api.getAccess();
  // `email` and `hasPassword` come only with a buyer session.
  if (access.hasPassword === undefined) redirect('/signin?next=/access');
  return (
    <div className={styles.wizard}>
      <h1 className={styles.title}>Мой доступ</h1>
      <AccessCard access={access} />
    </div>
  );
}
