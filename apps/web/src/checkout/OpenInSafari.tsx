'use client';
import { type DeviceFamily, HANDOFF_PARAM, type HandoffResponse } from '@xstore/shared';
import { Button } from '@xstore/ui';
import { useEffect, useState } from 'react';
import { browserApi } from './browser-api';
import styles from './checkout.module.css';
import own from './connect.module.css';
import { familyName } from './connect-step';
import { type BrowserApp, safariHint, safariOpenUrl } from './in-app-browser';

/** The page the link opens; the wizard step 2. */
const PATH = '/get/iphone';
/** A new link is asked for this long before the old one ends. */
const RENEW_BEFORE_MS = 30_000;

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
 * this page, so «⋯ → Открыть в Safari» carries the sign-in too.
 */
export function OpenInSafari({ app, family, origin, issue = defaultIssue }: OpenInSafariProps) {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<'no' | 'yes' | 'failed'>('no');
  const name = familyName(family);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async () => {
      try {
        const link = await issue();
        if (stopped) return;
        setToken(link.token);
        window.history.replaceState(
          window.history.state,
          '',
          `${PATH}?${HANDOFF_PARAM}=${link.token}`,
        );
        const renewIn = Math.max(0, link.expiresAt.getTime() - Date.now() - RENEW_BEFORE_MS);
        timer = setTimeout(ask, renewIn);
      } catch {
        // No link: Safari opens the page anyway and asks to sign in by code.
      }
    };
    void ask();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [issue]);

  const base = origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  const url = token ? `${base}${PATH}?${HANDOFF_PARAM}=${token}` : `${base}${PATH}`;

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
