'use client';

import type { AppCard } from '@xstore/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Section } from '../catalog/sections';
import { browserApi } from '../checkout/browser-api';

/** Delay before the panel closes once the pointer has left the pill and the panel. */
export const CLOSE_DELAY_MS = 150;

/** Sections whose first apps are shown as icons in the panel. */
export const ICON_SECTIONS = ['removed', 'premium'] as const satisfies Section['slug'][];

export type SectionIcons = Partial<Record<Section['slug'], AppCard[]>>;

const canHover = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * Open state of the desktop «Каталог» panel (spec 2026-11-17 §5): hover opens it with a mouse,
 * a click toggles it everywhere, leaving the pill closes it after {@link CLOSE_DELAY_MS}.
 * The first three apps of each section are fetched once, on first open or first hover.
 */
export function useCatalogMenu() {
  const [open, setOpen] = useState(false);
  const [icons, setIcons] = useState<SectionIcons>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const load = useCallback(() => {
    if (loaded.current) return;
    loaded.current = true;
    for (const slug of ICON_SECTIONS) {
      browserApi()
        .section(slug)
        .then(
          (page) =>
            setIcons((prev) => ({
              ...prev,
              [slug]: page.items.filter((app) => app.iconUrl).slice(0, 3),
            })),
          () => undefined,
        );
    }
  }, []);

  const show = useCallback(() => {
    cancel();
    load();
    setOpen(true);
  }, [cancel, load]);

  const hide = useCallback(() => {
    cancel();
    setOpen(false);
  }, [cancel]);

  const hideSoon = useCallback(() => {
    cancel();
    timer.current = setTimeout(() => {
      timer.current = null;
      setOpen(false);
    }, CLOSE_DELAY_MS);
  }, [cancel]);

  const toggle = useCallback(() => {
    if (open) hide();
    else show();
  }, [open, hide, show]);

  /** Hover opens only with a real mouse: a tap on a touch screen fires mouseenter too. */
  const hoverOpen = useCallback(() => {
    if (canHover()) show();
  }, [show]);

  useEffect(() => cancel, [cancel]);

  return { open, icons, show, hide, hideSoon, cancel, toggle, hoverOpen, load };
}

export type CatalogMenuState = ReturnType<typeof useCatalogMenu>;
