import {
  type AdminSubscription,
  deviceFamily,
  deviceStatusText,
  formatRuDate,
  type Page,
} from '@xstore/shared';
import Link from 'next/link';
import s from '../../../../src/admin/admin.module.css';
import { GrantForm, RevokedPeriod } from '../../../../src/admin/BillingForms';
import { DataTable } from '../../../../src/admin/DataTable';
import { FormField } from '../../../../src/admin/FormField';
import { adminServer } from '../../../../src/admin/server';
import { requireStaff } from '../../../../src/auth/session';

const date = (iso: string) => formatRuDate(new Date(iso));

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; cursor?: string }>;
}) {
  await requireStaff('/admin/subscriptions');
  const query = await searchParams;
  const params = new URLSearchParams();
  if (query.email) params.set('email', query.email.slice(0, 254));
  if (query.cursor) params.set('cursor', query.cursor.slice(0, 500));
  const data = await adminServer<Page<AdminSubscription>>(`/billing/subscriptions?${params}`);
  const next = new URLSearchParams(params);
  if (data.nextCursor) next.set('cursor', data.nextCursor);
  return (
    <>
      <h1>Подписки</h1>
      <GrantForm />
      <form className={s.tools}>
        <FormField label="Поиск по почте">
          <input type="search" name="email" maxLength={254} defaultValue={query.email} />
        </FormField>
        <button type="submit">Найти</button>
      </form>
      <DataTable
        caption="Подписки, новые сверху"
        headings={['Почта', 'Доступ', 'Периоды', 'iPhone']}
        stack
      >
        {data.items.map((sub) => (
          <tr key={sub.id}>
            <td data-label="Почта">
              {sub.email ?? '—'}
              {sub.provisional && <div className={s.muted}>оплата без входа</div>}
            </td>
            <td data-label="Доступ">
              {sub.accessUntil ? (
                <span className={s.badge} data-tone="ok">
                  до {date(sub.accessUntil)}
                </span>
              ) : (
                <span className={s.badge}>нет</span>
              )}
            </td>
            <td data-label="Периоды">
              <ul className={s.rights}>
                {sub.rights.map((r) => {
                  const text = `${date(r.startsAt)} — ${date(r.expiresAt)} · ${
                    r.source === 'order' ? 'оплата' : 'выдано вручную'
                  }${r.note ? ` · ${r.note}` : ''}`;
                  return (
                    <li key={r.id}>{r.revokedAt ? <RevokedPeriod>{text}</RevokedPeriod> : text}</li>
                  );
                })}
              </ul>
            </td>
            <td data-label="iPhone">
              {sub.device ? (
                <>
                  {sub.device.model}
                  <div className={s.muted}>
                    {deviceStatusText(sub.device.status, deviceFamily(sub.device.model))}
                  </div>
                  <div className={s.muted}>UDID {sub.device.udidMasked}</div>
                  {sub.device.assignedAt && (
                    <div className={s.muted}>привязан {date(sub.device.assignedAt)}</div>
                  )}
                </>
              ) : (
                'не подключён'
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      {data.items.length === 0 && <p>Подписок не найдено.</p>}
      {data.nextCursor && <Link href={`/admin/subscriptions?${next}`}>Показать ещё</Link>}
    </>
  );
}
