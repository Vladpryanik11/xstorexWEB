import type { Metadata } from 'next';
import { SigninLinkFromLocation } from '../../../../src/auth/SigninLink';
import styles from '../../../../src/checkout/checkout.module.css';

export const metadata: Metadata = {
  title: 'Вход по ссылке',
  robots: { index: false, follow: false },
  // The code travels in the fragment; no page here should leak the URL onwards.
  referrer: 'no-referrer',
};

/** `/signin/link#e=<email>&c=<code>` from the «Доступ открыт» letter (spec v2 §5, §9). */
export default function SigninLinkPage() {
  return (
    <div className={styles.wizard}>
      <section className={styles.panel} aria-labelledby="signin-link-title">
        <h1 id="signin-link-title" className={styles.title}>
          Вход по ссылке из письма
        </h1>
        <SigninLinkFromLocation />
      </section>
    </div>
  );
}
