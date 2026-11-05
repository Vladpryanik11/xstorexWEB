import type { Metadata } from 'next';
import { orNotFound, serverApi } from '../../../../src/api/server';
import { AppGrid } from '../../../../src/catalog/AppGrid';
import { CatalogPage, EmptyState } from '../../../../src/catalog/CatalogPage';

type Props = { params: Promise<{ slug: string }> };

async function loadList(params: Props['params']) {
  const { slug } = await params;
  return orNotFound((await serverApi()).list(slug));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const list = await loadList(params);
  return {
    title: list.title,
    description: `${list.title}: подборка приложений для iPhone в Xstore.`,
    openGraph: { title: list.title },
  };
}

// A list holds up to 100 apps (API), so it has no «Показать ещё».
export default async function ListPage({ params }: Props) {
  const list = await loadList(params);
  return (
    <CatalogPage title={list.title}>
      {list.items.length > 0 ? (
        <AppGrid apps={list.items} label={list.title} />
      ) : (
        <EmptyState>В этой подборке пока нет приложений.</EmptyState>
      )}
    </CatalogPage>
  );
}
