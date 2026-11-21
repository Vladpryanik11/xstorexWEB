'use client';
import { emailSchema } from '@xstore/shared';
import { Button } from '@xstore/ui';
import { useEffect, useState } from 'react';
import { browserApi } from '../checkout/browser-api';
import styles from '../checkout/checkout.module.css';
import type { SigninApi } from './SigninForm';

export const CODE_SIGNIN_URL = '/signin?next=/get/iphone&mode=code';

const STALE = 'Ссылка устарела. Войдите по коду из письма';

/** `#e=<email>&c=<code>` from the «Доступ открыт» letter; null when anything is off. */
export function readLinkHash(hash: string): { email: string; code: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const email = emailSchema.safeParse(params.get('e') ?? '');
  const code = params.get('c') ?? '';
  if (!email.success || !/^\d{6}$/.test(code)) return null;
  return { email: email.data, code };
}

export type SigninLinkProps = {
  /** The fragment as read once on mount (the page clears it from the address bar). */
  hash: string;
  api?: Pick<SigninApi, 'verifyCode'>;
  go?: (url: string) => void;
};

const defaultGo = (url: string) => window.location.assign(url);
const defaultApi: Pick<SigninApi, 'verifyCode'> = {
  verifyCode: (body) => browserApi().verifyCode(body),
};

/** `/signin/link`: the code is spent only on the button press, never on load (spec v2 §5). */
export function SigninLink({ hash, api = defaultApi, go = defaultGo }: SigninLinkProps) {
  const [link] = useState(() => readLinkHash(hash));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function enter() {
    if (!link) return;
    setBusy(true);
    try {
      await api.verifyCode(link);
      go('/get/iphone');
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  if (!link || failed) {
    return (
      <div className={styles.form}>
        <p role="alert" className={styles.problemText}>
          {STALE}
        </p>
        <Button href={CODE_SIGNIN_URL} className={styles.wide}>
          Войти по коду
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <p className={styles.lead}>Доступ открыт на {link.email}</p>
      <Button type="button" disabled={busy} className={styles.wide} onClick={() => void enter()}>
        {busy ? 'Входим…' : 'Войти и подключить iPhone'}
      </Button>
    </div>
  );
}

/**
 * Reads the fragment once after mount (it never reaches the server) and removes it from the
 * address bar and history, so the code does not linger on screen or in a shared URL.
 */
export function SigninLinkFromLocation() {
  const [hash, setHash] = useState<string | null>(null);
  useEffect(() => {
    const value = window.location.hash;
    if (value) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setHash(value);
  }, []);
  if (hash === null) return null;
  return <SigninLink hash={hash} />;
}
