import type { AdminAppDetail, AdminCategory, AdminVersion } from '@xstore/shared';
import { AppEditor } from '../../../../../src/admin/AppEditor';
import { adminServer } from '../../../../../src/admin/server';
import { requireStaff } from '../../../../../src/auth/session';

export default async function AppPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff(`/admin/apps/${encodeURIComponent(id)}`);
  const [app, versions, categories] = await Promise.all([
    adminServer<AdminAppDetail>(`/apps/${encodeURIComponent(id)}`),
    adminServer<AdminVersion[]>(`/apps/${encodeURIComponent(id)}/versions`),
    adminServer<AdminCategory[]>('/categories'),
  ]);
  return <AppEditor initial={app} initialVersions={versions} categories={categories} />;
}
