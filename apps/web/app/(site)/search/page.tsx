import { SearchField } from '@xstore/ui';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { orNotFound, serverApi } from '../../../src/api/server';
import { AppGrid } from '../../../src/catalog/AppGrid';
import { CatalogPage, EmptyState, MoreLink } from '../../../src/catalog/CatalogPage';
import { one, type SearchParams } from '../../../src/catalog/search-params';

type Props = { searchParams: Promise<SearchParams> };

/** Same bounds as the API (`searchQuerySchema`): shorter queries never reach it. */
const MIN = 2;
const MAX = 64;

export const metadata: Metadata = {
  title: 'Поиск',
  // Result pages are endless combinations of queries: keep them out of the index.
  robots: { index: false, follow: true },
};

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const raw = one(params.q) ?? '';
  const q = raw.trim().slice(0, MAX);
  const cursor = one(params.cursor);

  let body: ReactNode = null;
  if (q.length > 0 && q.length < MIN) {
    body = <EmptyState>Введите хотя бы 2 символа</EmptyState>;
  } else if (q.length >= MIN) {
    const page = await orNotFound((await serverApi()).search(q, cursor));
    body =
      page.items.length > 0 ? (
        <>
          <AppGrid apps={page.items} label="Результаты поиска" />
          {page.nextCursor ? (
            <MoreLink
              href={`/search?q=${encodeURIComponent(q)}&cursor=${encodeURIComponent(page.nextCursor)}`}
            />
          ) : null}
        </>
      ) : (
        <EmptyState>Ничего не нашлось. Попробуйте другое название.</EmptyState>
      );
  }

  return (
    <CatalogPage
      title="Поиск"
      lead={<SearchField action="/search" tone="page" defaultValue={raw} />}
    >
      {body}
    </CatalogPage>
  );
}
