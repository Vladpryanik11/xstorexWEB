'use client';

import { useEffect, useId, useRef, useState } from 'react';
import styles from './HowSheet.module.css';

/** What the service works by (owner 2026-11-24 11:56). */
const HOW = [
  {
    title: 'Официальный сертификат Apple',
    text: 'Приложения подписаны сертификатом разработчика Apple. С ним Apple сама разрешает ставить приложения не через App Store.',
  },
  {
    title: 'Ваш iPhone в списке разрешённых',
    text: 'Профиль сообщает нам только номер iPhone. По нему мы добавляем ваш iPhone в список устройств.',
  },
  {
    title: 'Приложения именно для вас',
    text: 'Каждое приложение подписываем под ваш iPhone, и оно ставится с сайта в один тап.',
  },
];

/** Why it is safe (owner 2026-11-24 11:51–11:55). */
const SAFE = [
  'Доступа к iPhone у нас нет: фото, сообщения, пароли и Apple ID мы не видим.',
  'Профиль и режим разработчика — обычные настройки Apple. Удалить или выключить их можно в любой момент.',
  'Только официальные файлы приложений, без сторонних программ и взломанных версий.',
  'Гарантия на весь срок подписки.',
];

/** Drops #how from the address once the window closes, so the header link opens it again. */
function clearHowHash() {
  if (window.location.hash === '#how') {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

/**
 * «Как это работает?» under the button of the first screen (owner 2026-11-24 09:11–09:12): a small
 * blue line that opens a window over the page, so nobody leaves the first screen. Owner 11:38–11:56:
 * the window explains in plain words what the service is, what it works by and why it is safe, on
 * one screen; the step-by-step instruction lives on the connect page. Closes with the cross, a tap
 * outside or Escape.
 */
export function HowSheet({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const howId = useId();
  const safeId = useId();
  const opener = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);

  // The header item «Как это работает» links to /#how (owner 2026-11-24 12:29: the section left
  // the home page), so the address opens the window; closing clears it so the link works again.
  useEffect(() => {
    const fromHash = () => {
      if (window.location.hash === '#how') setOpen(true);
    };
    // A click on the link while already on the home page: open here, before the router sees it.
    const onClick = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest('a[href="/#how"]') : null;
      if (!link || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('hashchange', fromHash);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  const close = () => {
    setOpen(false);
    clearHowHash();
    opener.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    closer.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        clearHowHash();
        opener.current?.focus();
      }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={opener}
        type="button"
        className={[styles.open, className].filter(Boolean).join(' ')}
        onClick={() => setOpen(true)}
      >
        Как это работает?
      </button>
      {open ? (
        <div className={styles.backdrop} data-how-sheet="">
          {/* A tap outside the window closes it; the cross and Escape do too. */}
          <button
            type="button"
            className={styles.scrim}
            tabIndex={-1}
            aria-hidden="true"
            onClick={close}
          />
          <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <div className={styles.head}>
              <h2 id={titleId} className={styles.title}>
                Как это работает
              </h2>
              <button
                ref={closer}
                type="button"
                className={styles.close}
                aria-label="Закрыть"
                onClick={close}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <p className={styles.lead}>
              Удалённые из App Store и платные приложения — в одной подписке.
            </p>
            <p className={styles.sub}>
              Ставятся прямо из Safari: без компьютера, без джейлбрейка и без входа в ваш Apple ID.
            </p>
            <h3 id={howId} className={styles.heading}>
              Как это устроено
            </h3>
            <ol className={styles.how} aria-labelledby={howId}>
              {HOW.map((item, i) => (
                <li key={item.title}>
                  <span className={styles.number} aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>
                    <b>{item.title}</b>
                    {item.text}
                  </span>
                </li>
              ))}
            </ol>
            <h3 id={safeId} className={styles.heading}>
              Почему это безопасно
            </h3>
            <ul className={styles.safe} aria-labelledby={safeId}>
              {SAFE.map((line) => (
                <li key={line}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="m5 12 5 5 9-10" />
                  </svg>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <a className={styles.next} href="/get">
              Подключить iPhone
            </a>
          </div>
        </div>
      ) : null}
    </>
  );
}
