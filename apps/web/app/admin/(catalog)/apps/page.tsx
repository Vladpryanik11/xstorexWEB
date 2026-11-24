import type { AdminAppListItem, AdminCategory, Page, UploadListItem } from '@xstore/shared';
import Link from 'next/link';
import { AppsBoard } from '../../../../src/admin/apps/AppsBoard';
import s from '../../../../src/admin/apps/apps.module.css';
import { adminServer } from '../../../../src/admin/server';
import { requireStaff } from '../../../../src/auth/session';

const FILTERS = [
  ['', 'Все'],
  ['removed', 'Удалённые'],
  ['premium', 'Премиум'],
  ['none', 'Без раздела'],
  ['hidden', 'Скрытые'],
] as const;

/** The one-screen admin (spec 2026-11-24 §2): upload IPA, then pick section and subcategory. */
export default async function AppsPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; q?: string; cursor?: string }>;
}) {
  const session = await requireStaff('/admin/apps');
  const query = await searchParams;
  const filter = FILTERS.some(([v]) => v === query.f) ? (query.f ?? '') : '';
  const params = new URLSearchParams();
  if (filter === 'hidden') params.set('status', 'hidden');
  else if (filter) params.set('section', filter);
  if (query.q) params.set('q', query.q.slice(0, 64));
  if (query.cursor) params.set('cursor', query.cursor);
  const [data, categories, uploads] = await Promise.all([
    adminServer<Page<AdminAppListItem>>(`/apps?${params}`),
    adminServer<AdminCategory[]>('/categories'),
    adminServer<UploadListItem[]>('/uploads'),
  ]);
  const next = new URLSearchParams(params);
  if (filter) next.set('f', filter);
  next.delete('section');
  next.delete('status');
  if (data.nextCursor) next.set('cursor', data.nextCursor);
  return (
    <>
      <h1>Приложения</h1>
      <nav className={s.filters} aria-label="Фильтр приложений">
        {FILTERS.map(([value, label]) => (
          <Link
            key={value}
            href={value ? `/admin/apps?f=${value}` : '/admin/apps'}
            aria-current={filter === value ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <AppsBoard
        ownerId={session.user.id}
        apps={data.items}
        categories={categories}
        uploads={uploads}
      />
      {data.nextCursor && <Link href={`/admin/apps?${next}`}>Показать ещё</Link>}
    </>
  );
}
