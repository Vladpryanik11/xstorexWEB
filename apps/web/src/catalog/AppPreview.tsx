'use client';

import { type AccessState, type DeviceFamily, formatRuDate } from '@xstore/shared';
import { AppIcon } from '@xstore/ui';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { type DeviceKind, deviceKind } from '../app-page/device';
import { installButtonState } from '../app-page/install-button-state';
import { browserApi } from '../checkout/browser-api';
import { browserFamily } from '../checkout/connect-step';
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

export const DESKTOP_NOTE = 'Установить можно с iPhone или iPad. Откройте этот сайт на телефоне.';

const GUEST: AccessState = { kind: 'none' };

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
  const [device, setDevice] = useState<DeviceKind>('ios');
  const [family, setFamily] = useState<DeviceFamily>('iphone');
  // Asked from the browser once the window opens, so the catalog pages stay cacheable;
  // `null` while the answer is on its way. Any failure falls back to the guest button.
  const [access, setAccess] = useState<AccessState | null>(null);
  const reduce = useReducedMotion() ?? false;
  const morph = !reduce;
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const primary = useRef<HTMLAnchorElement>(null);
  // Set once the visitor tabs or taps inside the window: focus is theirs from then on.
  const focusMoved = useRef(false);
  // The public catalog lists only apps with a published version.
  const latestVersion = { encrypted: false };
  const install = installButtonState({
    device,
    family,
    access: access ?? GUEST,
    app: { slug, latestVersion },
  });
  const phone = device === 'ios';

  // Forget the previous answer in the same update that opens the window: a reopened window never
  // shows it for a frame, and a closing one keeps its content while it animates away.
  const show = useCallback(() => {
    setAccess(null);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    // A shared link leaves `?app=` behind; closing returns to the plain page.
    if (variant === 'none') window.history.replaceState(null, '', window.location.pathname);
  }, [variant]);

  useEffect(() => {
    const { userAgent, maxTouchPoints } = window.navigator;
    setDevice(deviceKind(userAgent, maxTouchPoints));
    setFamily(browserFamily(userAgent, maxTouchPoints));
  }, []);

  useEffect(() => {
    if (!open) return;
    let current = true;
    browserApi()
      .getAccess()
      .then(
        (res) => current && setAccess(res.state),
        () => current && setAccess(GUEST),
      );
    return () => {
      current = false;
    };
  }, [open]);
  // After hydration, so the server and the first client render match.
  useEffect(() => {
    if (initialOpen) show();
  }, [initialOpen, show]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    const timer = window.setTimeout(() => setMounted(false), EXIT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  // While loading only «Закрыть» can hold focus; the main action takes it when it appears,
  // unless the visitor has already moved it.
  useEffect(() => {
    if (!open || access === null || focusMoved.current) return;
    if (document.activeElement === closeButton.current) primary.current?.focus();
  }, [open, access]);

  useEffect(() => {
    if (!open) return;
    const root = dialog.current;
    focusMoved.current = false;
    root?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onPointer = () => {
      focusMoved.current = true;
    };
    root?.addEventListener('pointerdown', onPointer);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !root) return;
      focusMoved.current = true;
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
      root?.removeEventListener('pointerdown', onPointer);
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
          onClick={show}
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
                    {access === null ? (
                      phone ? (
                        <ol
                          className={`${styles.steps} ${styles.blank}`}
                          data-placeholder
                          aria-hidden="true"
                        >
                          {INSTALL_STEPS.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      ) : (
                        <p
                          className={`${styles.note} ${styles.blank}`}
                          data-placeholder
                          aria-hidden="true"
                        >
                          {DESKTOP_NOTE}
                        </p>
                      )
                    ) : access.kind === 'payment_pending' ? (
                      <p className={styles.note}>Оплата ещё не завершена.</p>
                    ) : access.kind === 'active' ? (
                      <p className={styles.note}>
                        Доступ активен до {formatRuDate(access.until)}.
                        {phone ? null : ` ${DESKTOP_NOTE}`}
                      </p>
                    ) : phone ? (
                      <ol className={styles.steps} aria-label="Как установить">
                        {INSTALL_STEPS.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    ) : (
                      <p className={styles.note}>{DESKTOP_NOTE}</p>
                    )}
                    <div className={styles.actions} aria-live="polite" aria-busy={access === null}>
                      {access === null ? (
                        <span className={styles.soon} aria-hidden="true">
                          {install.label}
                        </span>
                      ) : install.href ? (
                        <a ref={primary} className={styles.install} href={install.href}>
                          {install.label}
                        </a>
                      ) : (
                        <button type="button" className={styles.soon} disabled>
                          {install.label}
                        </button>
                      )}
                      {access === null ? (
                        <p className={`${styles.paid} ${styles.reserve}`} aria-hidden="true">
                          Уже оплачивали? Войти
                        </p>
                      ) : null}
                      {access !== null && install.signinHref ? (
                        <p className={styles.paid}>
                          Уже оплачивали? <a href={install.signinHref}>Войти</a>
                        </p>
                      ) : null}
                    </div>
                    <button
                      ref={closeButton}
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
