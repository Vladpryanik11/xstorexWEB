import type { AdminAppListItem, Page } from '@xstore/shared';
import Link from 'next/link';
import s from '../../../../src/admin/admin.module.css';
import { statusLabel } from '../../../../src/admin/api';
import { DataTable } from '../../../../src/admin/DataTable';
import { FormField } from '../../../../src/admin/FormField';
import { adminServer } from '../../../../src/admin/server';
import { requireStaff } from '../../../../src/auth/session';

export default async function AppsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; cursor?: string }>;
}) {
  await requireStaff('/admin/apps');
  const query = await searchParams;
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q.slice(0, 64));
  if (query.status && ['draft', 'published', 'hidden'].includes(query.status))
    params.set('status', query.status);
  if (query.cursor) params.set('cursor', query.cursor);
  const data = await adminServer<Page<AdminAppListItem>>(`/apps?${params}`);
  const next = new URLSearchParams(params);
  if (data.nextCursor) next.set('cursor', data.nextCursor);
  return (
    <>
      <h1>Приложения</h1>
      <Link href="/admin/apps/upload">Загрузить IPA</Link>
      <form className={s.tools}>
        <FormField label="Поиск приложений">
          <input type="search" name="q" maxLength={64} defaultValue={query.q} />
        </FormField>
        <FormField label="Статус">
          <select name="status" defaultValue={query.status ?? ''}>
            <option value="">Все</option>
            {Object.entries(statusLabel).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </FormField>
        <button type="submit">Найти</button>
      </form>
      <DataTable
        caption="Каталог приложений"
        headings={['Приложение', 'Категория', 'Версия', 'Статус']}
      >
        {data.items.map((app) => (
          <tr key={app.id}>
            <td>
              <Link href={`/admin/apps/${app.id}`}>{app.name}</Link>
            </td>
            <td>{app.category?.name ?? 'Не выбрана'}</td>
            <td>{app.latestVersion ?? '—'}</td>
            <td>{statusLabel[app.status]}</td>
          </tr>
        ))}
      </DataTable>
      {data.items.length === 0 && <p>Приложений не найдено.</p>}
      {data.nextCursor && <Link href={`/admin/apps?${next}`}>Показать ещё</Link>}
    </>
  );
}
