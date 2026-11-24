'use client';

import type { AppCard, Page } from '@xstore/shared';
import { SearchField } from '@xstore/ui';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { browserApi } from '../checkout/browser-api';
import { APPS } from './figures';
import styles from './HeroFinder.module.css';
import { HeroLanes, matchApp, mixedApps } from './HeroLanes';

/** The API searches from two letters (`searchQuerySchema`). */
const MIN = 2;
const MAX = 64;
/** Asked this long after the last letter. */
const DELAY_MS = 250;

export type HeroLaneApps = { removed: AppCard[]; premium: AppCard[] };

type State =
  | { kind: 'idle' }
  | { kind: 'loading'; q: string }
  | { kind: 'done'; q: string; count: number; more: boolean }
  | { kind: 'error'; q: string };

const searchCatalog = (q: string) => browserApi().search(q);

/**
 * The live lane and the search under it (spec 2026-11-23-home-first-screen, «Лента как Dock»,
 * owner 2026-11-24): every letter looks for the app in the lane and moves it to the middle; an
 * app that is not in the lane is looked for in the whole catalog from two letters, and the grey
 * line under the field («200+ приложений») then links to what was found. Enter opens `/search`.
 * Renders two grid items of the hero.
 */
export function HeroFinder({
  lanes,
  lanesClassName,
  searchClassName,
  search = searchCatalog,
}: {
  lanes: HeroLaneApps;
  lanesClassName?: string;
  searchClassName?: string;
  search?: (q: string) => Promise<Page<AppCard>>;
}) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  // Only the answer to the latest query is shown.
  const latest = useRef('');

  const q = query.trim().slice(0, MAX);
  const inLane = matchApp(mixedApps(lanes.removed, lanes.premium), q);
  const asksCatalog = q.length >= MIN && inLane === null;

  useEffect(() => {
    latest.current = asksCatalog ? q : '';
    if (!asksCatalog) {
      setState({ kind: 'idle' });
      return;
    }
    setState({ kind: 'loading', q });
    const timer = setTimeout(() => {
      search(q).then(
        (page) => {
          if (latest.current === q) {
            setState({
              kind: 'done',
              q,
              count: page.items.length,
              more: page.nextCursor !== null,
            });
          }
        },
        () => {
          if (latest.current === q) setState({ kind: 'error', q });
        },
      );
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [q, asksCatalog, search]);

  let line: ReactNode = `${APPS} приложений`;
  if (state.kind === 'done' && state.count > 0) {
    line = (
      <a className={styles.found} href={`/search?q=${encodeURIComponent(state.q)}`}>
        Нашли {state.count}
        {state.more ? '+' : ''} в каталоге ›
      </a>
    );
  } else if (state.kind === 'done') {
    line = 'Такого приложения пока нет в каталоге';
  } else if (state.kind === 'error') {
    line = 'Поиск не ответил';
  }

  return (
    <>
      <div className={lanesClassName} data-hero-finder="">
        <HeroLanes
          removed={lanes.removed}
          premium={lanes.premium}
          focus={inLane}
          paused={q.length > 0}
        />
      </div>
      <div className={searchClassName}>
        <SearchField
          action="/search"
          placeholder="Найти свое приложение"
          onQueryChange={setQuery}
        />
        <p className={styles.count} data-hero-count="" aria-live="polite">
          {line}
        </p>
      </div>
    </>
  );
}
