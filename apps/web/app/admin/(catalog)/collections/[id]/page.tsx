import type { AdminCollection } from '@xstore/shared';
import { notFound } from 'next/navigation';
import { adminServer } from '../../../../../src/admin/server';
import { CollectionEditor } from '../../../../../src/admin/TaxonomyEditor';
import { requireStaff } from '../../../../../src/auth/session';

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff(`/admin/collections/${encodeURIComponent(id)}`);
  const collection = (await adminServer<AdminCollection[]>('/collections')).find(
    (c) => c.id === id,
  );
  if (!collection) notFound();
  return <CollectionEditor initial={collection} />;
}
