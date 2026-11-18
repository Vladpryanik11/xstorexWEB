'use client';

import { AppIcon } from '@xstore/ui';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { installButtonState } from '../app-page/install-button-state';
import styles from './AppPreview.module.css';

export type AppPreviewProps = {
  slug: string;
  name: string;
  subtitle?: string;
  iconUrl?: string;
  /**
   * What opens the sheet: an icon with the name (grids and rails), a catalog row, or nothing
   * (a shared `/?app=` link opens it by itself).
   */
  variant?: 'tile' | 'row' | 'none';
  /** Open on mount, for a shared link. */
  initialOpen?: boolean;
};

/** Mini instruction in the sheet; payment comes first, no registration (owner 2026-11-18). */
export const INSTALL_STEPS = [
  'Нажмите «Установить» и оплатите доступ. Регистрация не нужна.',
  'Подтвердите установку в окне на экране.',
  'Значок появится на экране «Домой».',
] as const;

export const DESKTOP_NOTE =
  'Установить можно только на iPhone или iPad: откройте этот сайт на телефоне. Оплатить можно и здесь.';

/** iPhone, iPad or iPod; iPadOS reports itself as a Mac with touch. */
function isAppleMobile(): boolean {
  const { userAgent, maxTouchPoints } = window.navigator;
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

const SPRING = { type: 'spring', stiffness: 380, damping: 34 } as const;
const FOCUSABLE = 'a[href], button:not([disabled])';
const EXIT_FALLBACK_MS = 450;

/**
 * The install sheet: tapping an app anywhere in the catalog opens its icon, a three-step
 * instruction and «Установить»; there is no separate app page (owner 2026-11-18). Adapted
 * from Motion Primitives «Morphing Dialog», adapted from Motion Primitives «Morphing Dialog»
 * (https://motion-primitives.com/docs/morphing-dialog): the icon and the card morph into the dialog
 * through shared `layoutId`s. Under reduced motion the dialog simply appears.
 */
export function AppPreview({
  slug,
  name,
  subtitle,
  iconUrl,
  variant = 'tile',
  initialOpen = false,
}: AppPreviewProps) {
  const [open, setOpen] = useState(false);
  // The layer stays mounted while the card morphs back; a fallback ends it even where a browser
  // never finishes the shared-layout exit (seen in WebKit CI and jsdom).
  const [mounted, setMounted] = useState(false);
  // Rendered as a phone on the server; a computer gets its note after hydration.
  const [phone, setPhone] = useState(true);
  const reduce = useReducedMotion() ?? false;
  const morph = !reduce;
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const install = installButtonState({
    signedIn: false,
    app: { slug, accessLevel: 'public', latestVersion: { encrypted: false } },
  });

  const close = useCallback(() => {
    setOpen(false);
    // A shared link leaves `?app=` behind; closing returns to the plain page.
    if (variant === 'none') window.history.replaceState(null, '', window.location.pathname);
  }, [variant]);

  useEffect(() => setPhone(isAppleMobile()), []);
  // After hydration, so the server and the first client render match.
  useEffect(() => {
    if (initialOpen) setOpen(true);
  }, [initialOpen]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    const timer = window.setTimeout(() => setMounted(false), EXIT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const root = dialog.current;
    root?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      trigger.current?.focus();
    };
  }, [open, close]);

  const layout = (part: string) => (morph ? `${id}-${part}` : undefined);
  const transition = morph ? SPRING : { duration: 0 };
  const icon = (
    <motion.span className={styles.icon} layoutId={layout('card')} transition={transition}>
      <motion.span className={styles.icon} layoutId={layout('icon')} transition={transition}>
        <AppIcon src={iconUrl} alt="" size={variant === 'tile' ? 76 : 56} />
      </motion.span>
    </motion.span>
  );

  return (
    <>
      {variant === 'none' ? null : (
        <button
          ref={trigger}
          type="button"
          className={styles[variant]}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          {icon}
          {variant === 'tile' ? <span className={styles.tileName}>{name}</span> : null}
          {variant === 'row' ? (
            <span className={styles.rowText}>
              <span className={styles.rowName}>{name}</span>
              {subtitle ? <span className={styles.rowSubtitle}>{subtitle}</span> : null}
            </span>
          ) : null}
        </button>
      )}
      {!(open || mounted) || typeof document === 'undefined'
        ? null
        : createPortal(
            <AnimatePresence onExitComplete={() => setMounted(false)}>
              {open ? (
                <div className={styles.layer} key="layer">
                  <motion.div
                    className={styles.backdrop}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={morph ? { duration: 0.2 } : { duration: 0 }}
                    onClick={close}
                    aria-hidden="true"
                  />
                  <motion.div
                    ref={dialog}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={`${id}-name`}
                    data-morph={morph ? 'true' : 'false'}
                    className={styles.card}
                    layoutId={layout('card')}
                    transition={transition}
                  >
                    <motion.span
                      className={styles.bigIcon}
                      layoutId={layout('icon')}
                      transition={transition}
                    >
                      <AppIcon src={iconUrl} alt="" size={120} />
                    </motion.span>
                    <h2 id={`${id}-name`} className={styles.name}>
                      {name}
                    </h2>
                    {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
                    {phone ? (
                      <ol className={styles.steps} aria-label="Как установить">
                        {INSTALL_STEPS.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    ) : (
                      <p className={styles.note}>{DESKTOP_NOTE}</p>
                    )}
                    <div className={styles.actions}>
                      {install.href ? (
                        <a className={styles.install} href={install.href}>
                          Установить
                        </a>
                      ) : (
                        <span className={styles.soon}>{install.label}</span>
                      )}
                      {install.signinHref ? (
                        <p className={styles.paid}>
                          Уже оплачивали? <a href={install.signinHref}>Войти</a>
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className={styles.close}
                      aria-label="Закрыть"
                      onClick={close}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                        <path
                          d="M2 2l10 10M12 2 2 12"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </motion.div>
                </div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )}
    </>
  );
}
