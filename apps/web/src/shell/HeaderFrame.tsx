'use client';

import { type ReactNode, useEffect, useState } from 'react';

/** Scroll distance after which the floating pill narrows (spec 2026-11-17 §5). */
export const COMPACT_AFTER_PX = 24;

/**
 * The `<header>` element of the floating pill. It only tracks whether the page has scrolled past
 * {@link COMPACT_AFTER_PX}; the narrowing itself is CSS on `[data-scrolled="true"]`.
 * Behaviour adapted from Aceternity UI «Resizable Navbar» (https://ui.aceternity.com/components/resizable-navbar).
 */
export function HeaderFrame({ className, children }: { className?: string; children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > COMPACT_AFTER_PX);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <header className={className} data-scrolled={scrolled ? 'true' : 'false'}>
      {children}
    </header>
  );
}
