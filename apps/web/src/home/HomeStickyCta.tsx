'use client';

import { useEffect, useState } from 'react';
import styles from './HomeStickyCta.module.css';

/**
 * Phone-only bar with the offer button (spec v2 §3.1): appears once the hero button has
 * scrolled up off screen and hides over the footer, so it never covers the footer links.
 */
export function HomeStickyCta() {
  const [pastHero, setPastHero] = useState(false);
  const [atFooter, setAtFooter] = useState(false);

  useEffect(() => {
    const hero = document.querySelector('[data-hero-cta]');
    const footer = document.querySelector('footer');
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) setPastHero(!e.isIntersecting && e.boundingClientRect.top < 0);
        else if (e.target === footer) setAtFooter(e.isIntersecting);
      }
    });
    if (hero) io.observe(hero);
    if (footer) io.observe(footer);
    return () => io.disconnect();
  }, []);

  return (
    <div className={styles.bar} hidden={!pastHero || atFooter}>
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
