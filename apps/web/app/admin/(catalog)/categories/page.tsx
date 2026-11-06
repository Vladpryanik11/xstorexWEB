import type { AdminCategory } from '@xstore/shared';
import { adminServer } from '../../../../src/admin/server';
import { CategoriesEditor } from '../../../../src/admin/TaxonomyEditor';
import { requireStaff } from '../../../../src/auth/session';

export default async function CategoriesPage() {
  await requireStaff('/admin/categories');
  return <CategoriesEditor initial={await adminServer<AdminCategory[]>('/categories')} />;
}
