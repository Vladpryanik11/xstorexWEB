import type { AdminCollection } from '@xstore/shared';
import { adminServer } from '../../../../src/admin/server';
import { CollectionsEditor } from '../../../../src/admin/TaxonomyEditor';
import { requireStaff } from '../../../../src/auth/session';

export default async function CollectionsPage() {
  await requireStaff('/admin/collections');
  return <CollectionsEditor initial={await adminServer<AdminCollection[]>('/collections')} />;
}
