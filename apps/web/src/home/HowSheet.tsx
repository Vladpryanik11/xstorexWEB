'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { HOW_STEPS } from '../catalog/HowItWorks';
import styles from './HowSheet.module.css';

/**
 * «Как это работает?» under the button of the first screen (owner 2026-11-24 09:11–09:12): a small
 * blue line that opens a window over the page with the three steps, swiped through one by one, so
 * nobody leaves the first screen. «Дальше» turns the step; the last one ends with the button to
 * connect an iPhone. Closes with the cross, a tap outside or Escape.
 */
export function HowSheet({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const titleId = useId();
  const opener = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const last = HOW_STEPS.length - 1;

  const close = () => {
    setOpen(false);
    opener.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    closer.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
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

  const go = (i: number) => {
    setStep(i);
    const el = track.current;
    if (el && typeof el.scrollTo === 'function') {
      el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
    }
  };

  // A swipe turns the step too.
  const onScroll = () => {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== step) setStep(Math.max(0, Math.min(last, i)));
  };

  return (
    <>
      <button
        ref={opener}
        type="button"
        className={[styles.open, className].filter(Boolean).join(' ')}
        onClick={() => {
          setStep(0);
          setOpen(true);
        }}
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
            <div ref={track} className={styles.track} onScroll={onScroll}>
              {HOW_STEPS.map((s, i) => (
                // biome-ignore lint/a11y/useSemanticElements: a step of a carousel is a group (WAI-ARIA)
                <section
                  key={s.title}
                  className={styles.slide}
                  role="group"
                  aria-roledescription="шаг"
                  aria-label={`Шаг ${i + 1} из ${HOW_STEPS.length}`}
                >
                  <span className={styles.number} aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3 className={styles.stepTitle}>{s.title}</h3>
                  <p className={styles.text}>{s.text}</p>
                </section>
              ))}
            </div>
            <div className={styles.dots}>
              {HOW_STEPS.map((s, i) => (
                <button
                  key={s.title}
                  type="button"
                  className={styles.dot}
                  aria-label={`Шаг ${i + 1}`}
                  aria-current={i === step ? 'step' : undefined}
                  onClick={() => go(i)}
                />
              ))}
            </div>
            {step < last ? (
              <button type="button" className={styles.next} onClick={() => go(step + 1)}>
                Дальше
              </button>
            ) : (
              <a className={styles.next} href="/get">
                Подключить iPhone
              </a>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
