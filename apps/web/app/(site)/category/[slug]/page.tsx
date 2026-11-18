import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { orNotFound, serverApi } from '../../../../src/api/server';
import { CatalogPage, EmptyState, MoreLink } from '../../../../src/catalog/CatalogPage';
import { CategoryChips } from '../../../../src/catalog/CategoryChips';
import { IconGrid } from '../../../../src/catalog/IconGrid';
import { categoryHref } from '../../../../src/catalog/links';
import { one, type SearchParams } from '../../../../src/catalog/search-params';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

async function loadCategory(params: Props['params']) {
  const { slug } = await params;
  const categories = await (await serverApi()).categories();
  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();
  return { category, categories };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await loadCategory(params);
  const title = `${category.name}: приложения для iPhone и iPad`;
  return { title, description: `${title} в Xstore.`, openGraph: { title } };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category, categories } = await loadCategory(params);
  const cursor = one((await searchParams).cursor);
  const page = await orNotFound((await serverApi()).category(category.slug, cursor));

  return (
    <CatalogPage
      title={category.name}
      lead={<CategoryChips categories={categories} active={category.slug} />}
    >
      {page.items.length > 0 ? (
        <IconGrid apps={page.items} label={category.name} />
      ) : (
        <EmptyState>Здесь пока пусто. Загляните позже или выберите другую категорию.</EmptyState>
      )}
      {page.nextCursor ? (
        <MoreLink
          href={`${categoryHref(category.slug)}?cursor=${encodeURIComponent(page.nextCursor)}`}
        />
      ) : null}
    </CatalogPage>
  );
}
