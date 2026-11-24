'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { HOW_STEPS } from '../catalog/HowItWorks';
import styles from './HowSheet.module.css';

/**
 * «Как это работает?» under the button of the first screen (owner 2026-11-24 09:11–09:12): a small
 * blue line that opens a window over the page with the three steps, swiped through one by one, so
 * nobody leaves the first screen. «Дальше» turns the step; the last one ends with the button to
 * connect an iPhone. Closes with the cross, a tap outside or Escape. Each step shows a small iPhone
 * screen of what the person will see there (owner 2026-11-24 10:12, variant А).
 */
export function HowSheet({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const titleId = useId();
  const opener = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const track = useRef<HTMLDivElement>(null);
  // While «Дальше» scrolls to a step, the scroll events in between do not turn the step back.
  const target = useRef<number | null>(null);
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
    target.current = i;
    // A swipe that stops the smooth scroll midway turns the steps again after a moment.
    setTimeout(() => {
      if (target.current === i) target.current = null;
    }, 1000);
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
    if (target.current !== null) {
      if (i !== target.current) return;
      target.current = null;
    }
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
                  <StepScreen step={i} />
                  <p className={styles.count} data-how-count="">
                    Шаг {i + 1} из {HOW_STEPS.length}
                  </p>
                  <h3 className={styles.stepTitle}>{s.title}</h3>
                  <p className={styles.text}>{s.text}</p>
                  {s.how ? (
                    <ol className={styles.how}>
                      {s.how.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ol>
                  ) : null}
                  {s.safe ? (
                    <p className={styles.safe} data-how-safe="">
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M12 3 5 6v5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6l-7-3Z" />
                      </svg>
                      <span>{s.safe}</span>
                    </p>
                  ) : null}
                  {s.note ? <p className={styles.note}>{s.note}</p> : null}
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
            <p className={styles.guarantee}>Гарантия на весь срок подписки</p>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** A small iPhone screen of the step, drawn in the site's colours; for the eye only. */
function StepScreen({ step }: { step: number }) {
  return (
    <div className={styles.shot} data-how-screen="" aria-hidden="true">
      <div className={styles.screen}>{SCREENS[step]}</div>
    </div>
  );
}

const APP_TONES = ['#2aa4ff', '#ff5a5f', '#34c759', '#ffb340', '#8e5cff', '#0e1a33'];

const SCREENS = [
  <>
    <span className={styles.screenHead}>Оплата</span>
    <span>Подписка на месяц, 1 iPhone</span>
    <span className={styles.field}>Ваша почта</span>
    <span className={styles.pill}>Оплатить</span>
  </>,
  <>
    <span className={styles.back}>‹ Настройки</span>
    <span className={styles.screenHead}>Конфиденциальность и безопасность</span>
    <span className={styles.row}>
      <i className={styles.rowIcon} data-tone="blue" />
      <span className={styles.label}>Службы геолокации</span>
    </span>
    <span className={styles.row} data-hot="">
      <i className={styles.rowIcon} />
      <span className={styles.label}>Режим разработчика</span>
      <i className={styles.toggle} />
    </span>
    <span className={styles.row}>
      <i className={styles.rowIcon} data-tone="green" />
      <span className={styles.label}>Режим блокировки</span>
    </span>
  </>,
  <>
    <span className={styles.screenHead}>Настройки</span>
    <span className={styles.row} data-hot="">
      <i className={styles.rowIcon} data-tone="green" />
      <span className={styles.label}>Профиль загружен</span>
    </span>
    <span className={styles.row}>
      <i className={styles.rowIcon} />
      <span className={styles.label}>Основные</span>
    </span>
    <span className={styles.pill}>Установить</span>
  </>,
  <>
    <span className={styles.screenHead}>Каталог</span>
    <span className={styles.apps}>
      {APP_TONES.map((c) => (
        <i key={c} style={{ background: c }} />
      ))}
    </span>
    <span className={styles.pill}>Установить</span>
  </>,
];
