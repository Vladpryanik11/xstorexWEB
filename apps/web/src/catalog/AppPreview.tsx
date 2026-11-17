'use client';

import { AppIcon } from '@xstore/ui';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { installButtonState } from '../app-page/install-button-state';
import styles from './AppPreview.module.css';
import { appHref } from './links';

export type AppPreviewProps = {
  slug: string;
  name: string;
  subtitle?: string;
  iconUrl?: string;
};

const SPRING = { type: 'spring', stiffness: 380, damping: 34 } as const;
const FOCUSABLE = 'a[href], button:not([disabled])';

/**
 * Quick look at an app from its icon, adapted from Motion Primitives «Morphing Dialog»
 * (https://motion-primitives.com/docs/morphing-dialog): the icon and the card morph into the dialog
 * through shared `layoutId`s. Under reduced motion the dialog simply appears.
 */
export function AppPreview({ slug, name, subtitle, iconUrl }: AppPreviewProps) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion() ?? false;
  const morph = !reduce;
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const install = installButtonState({
    signedIn: false,
    app: { slug, accessLevel: 'public', latestVersion: { encrypted: false } },
  });

  const close = useCallback(() => setOpen(false), []);

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

  return (
    <>
      <motion.button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-label={`Быстрый просмотр: ${name}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        layoutId={layout('card')}
        transition={transition}
      >
        <motion.span className={styles.icon} layoutId={layout('icon')} transition={transition}>
          <AppIcon src={iconUrl} alt="" size={56} />
        </motion.span>
      </motion.button>
      {typeof document === 'undefined'
        ? null
        : createPortal(
            <AnimatePresence>
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
                    <div className={styles.actions}>
                      {install.href ? (
                        <a className={styles.install} href={install.href}>
                          Установить
                        </a>
                      ) : null}
                      <a className={styles.more} href={appHref(slug)}>
                        Подробнее
                      </a>
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
