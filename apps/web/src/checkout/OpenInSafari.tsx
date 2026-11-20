'use client';
import { type DeviceFamily, HANDOFF_PARAM, type HandoffResponse } from '@xstore/shared';
import { Button } from '@xstore/ui';
import { useEffect, useState } from 'react';
import { browserApi } from './browser-api';
import styles from './checkout.module.css';
import own from './connect.module.css';
import { familyName } from './connect-step';
import { type BrowserApp, safariHint, safariOpenUrl } from './in-app-browser';

/**
 * The page the link opens. The token rides in the fragment, which browsers never send to the
 * server, so it stays out of server and proxy logs.
 */
export const HANDOFF_PATH = '/get/iphone/continue';
/** A new link is asked for this long before the old one ends, while the page is in view. */
const RENEW_BEFORE_MS = 30_000;
/** Renewals stop after about an hour; the copied link then falls back to sign-in by code. */
const MAX_RENEWALS = 5;

const linkPath = (token: string | null) =>
  token ? `${HANDOFF_PATH}#${HANDOFF_PARAM}=${token}` : '/get/iphone';

export type OpenInSafariProps = {
  app: Exclude<BrowserApp, 'safari'>;
  family: DeviceFamily;
  /** The site origin; `window.location.origin` when left out. */
  origin?: string;
  issue?: () => Promise<HandoffResponse>;
};

const defaultIssue = () => browserApi().issueHandoff();

/**
 * Spec v2 §4 step 2a: the site is open outside Safari, where the iPhone cannot be connected.
 * The one-time sign-in link goes into the button, into the copied link and into the address of
 * this page (`/get/iphone/continue#h=…`), so «⋯ → Открыть в Safari» carries the sign-in too.
 */
export function OpenInSafari({ app, family, origin, issue = defaultIssue }: OpenInSafariProps) {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<'no' | 'yes' | 'failed'>('no');
  const name = familyName(family);

  useEffect(() => {
    let stopped = false;
    let asked = 0;
    let due = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async () => {
      due = false;
      asked += 1;
      try {
        const link = await issue();
        if (stopped) return;
        setToken(link.token);
        // «⋯ → Открыть в Safari» opens the address of this page: the sign-in goes with it.
        window.history.replaceState(window.history.state, '', linkPath(link.token));
        if (asked > MAX_RENEWALS) return;
        const renewIn = Math.max(0, link.expiresAt.getTime() - Date.now() - RENEW_BEFORE_MS);
        timer = setTimeout(() => {
          if (document.visibilityState === 'hidden') due = true;
          else void ask();
        }, renewIn);
      } catch {
        // No link: Safari opens the page anyway and asks to sign in by code.
      }
    };
    const onVisible = () => {
      if (due && document.visibilityState === 'visible') void ask();
    };
    document.addEventListener('visibilitychange', onVisible);
    void ask();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [issue]);

  const base = origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  const url = `${base}${linkPath(token)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied('yes');
    } catch {
      setCopied('failed');
    }
  }

  return (
    <section className={styles.panel}>
      <h1 className={styles.title}>Осталось открыть в Safari</h1>
      <p className={styles.lead}>
        {token
          ? `Подключить ${name} можно только в Safari. Вход сохранится.`
          : `Подключить ${name} можно только в Safari.`}
      </p>
      <Button href={safariOpenUrl(url)} className={styles.wide}>
        Открыть в Safari
      </Button>
      <p className={own.hint}>{safariHint(app)}</p>
      <Button variant="quiet" onClick={copy} className={styles.wide}>
        Скопировать ссылку
      </Button>
      {copied === 'yes' ? (
        <p className={own.notice} role="status">
          Ссылка скопирована. Откройте Safari и вставьте её в адресную строку.
        </p>
      ) : copied === 'failed' ? (
        <label className={own.copyField}>
          <span>Ссылка</span>
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        </label>
      ) : null}
    </section>
  );
}
