'use client';

import { useEffect, useState } from 'react';
import styles from './HomeStickyCta.module.css';

/**
 * Phone-only bar with the offer button (spec v2 §3.1): appears once the hero button has
 * scrolled up off screen; hides over the footer and while another offer button
 * (`data-page-cta`) is on screen, so it never doubles a button or covers the footer links.
 */
export function HomeStickyCta() {
  const [pastHero, setPastHero] = useState(false);
  const [atFooter, setAtFooter] = useState(false);
  const [ctaOnScreen, setCtaOnScreen] = useState(0);

  useEffect(() => {
    const hero = document.querySelector('[data-hero-cta]');
    const footer = document.querySelector('footer');
    const others = [...document.querySelectorAll('[data-page-cta]')];
    const visible = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) setPastHero(!e.isIntersecting && e.boundingClientRect.top < 0);
        else if (e.target === footer) setAtFooter(e.isIntersecting);
        else {
          if (e.isIntersecting) visible.add(e.target);
          else visible.delete(e.target);
          setCtaOnScreen(visible.size);
        }
      }
    });
    if (hero) io.observe(hero);
    if (footer) io.observe(footer);
    for (const el of others) io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className={styles.bar} hidden={!pastHero || atFooter || ctaOnScreen > 0}>
      <span className={styles.offer}>
        <b>200+ приложений</b>
        <span>с&nbsp;Premium‑доступом</span>
      </span>
      <a className={styles.cta} href="/get">
        Подключить iPhone
      </a>
    </div>
  );
}
