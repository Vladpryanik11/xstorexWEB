'use client';

import type { AppCard, Page } from '@xstore/shared';
import { SearchField } from '@xstore/ui';
import { useEffect, useRef, useState } from 'react';
import { browserApi } from '../checkout/browser-api';
import { type DockState, HeroDock } from './HeroDock';
import styles from './HeroFinder.module.css';
import { HeroLanes } from './HeroLanes';

/** The API searches from two letters (`searchQuerySchema`). */
const MIN = 2;
const MAX = 64;
/** Asked this long after the last letter. */
const DELAY_MS = 250;

export type HeroLaneApps = { removed: AppCard[]; premium: AppCard[] };

const searchCatalog = (q: string) => browserApi().search(q);

/**
 * The live lanes and the search under them (spec 2026-11-23-home-first-screen §3.3–3.4, owner
 * 2026-11-23 18:16, variant В «Док с найденными»): from two letters the lanes dissolve and a
 * shelf of the apps found in the whole catalog takes their place; clearing the field brings the
 * lanes back. Enter still opens `/search`. Renders two grid items of the hero.
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
  const [state, setState] = useState<DockState>({ kind: 'idle' });
  // Only the answer to the latest query is shown.
  const latest = useRef('');

  const q = query.trim().slice(0, MAX);
  const searching = q.length >= MIN;

  useEffect(() => {
    latest.current = q;
    if (q.length < MIN) {
      setState({ kind: 'idle' });
      return;
    }
    setState((s) => (s.kind === 'done' ? s : { kind: 'loading', q }));
    const timer = setTimeout(() => {
      search(q).then(
        (page) => {
          if (latest.current === q) {
            setState({ kind: 'done', q, items: page.items, more: page.nextCursor !== null });
          }
        },
        () => {
          if (latest.current === q) setState({ kind: 'error', q });
        },
      );
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [q, search]);

  const found =
    searching && state.kind === 'done' && state.items.length > 0
      ? `Нашли ${state.items.length}${state.more ? '+' : ''}`
      : null;
  const said =
    !searching || state.kind === 'idle' || state.kind === 'loading'
      ? ''
      : state.kind === 'error'
        ? 'Поиск не ответил'
        : (found ?? 'Такого приложения пока нет в каталоге');

  return (
    <>
      <div
        className={[lanesClassName, styles.area].filter(Boolean).join(' ')}
        data-hero-finder=""
        data-searching={searching ? '' : undefined}
      >
        <div className={styles.lanes} aria-hidden={searching ? true : undefined} inert={searching}>
          <HeroLanes removed={lanes.removed} premium={lanes.premium} />
        </div>
        {searching ? (
          <div className={styles.dock}>
            <HeroDock state={state} />
          </div>
        ) : null}
        <p className={styles.status} aria-live="polite">
          {said}
        </p>
      </div>
      <div className={searchClassName}>
        <SearchField
          action="/search"
          placeholder="Найти свое приложение"
          onQueryChange={setQuery}
          trailing={found ? <span aria-hidden="true">{found}</span> : null}
        />
      </div>
    </>
  );
}
