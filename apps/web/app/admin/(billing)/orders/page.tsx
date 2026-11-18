import { type AdminOrder, formatRuDate, orderStatusSchema, type Page } from '@xstore/shared';
import Link from 'next/link';
import s from '../../../../src/admin/admin.module.css';
import { orderStatusLabel, orderStatusTone } from '../../../../src/admin/api';
import { RefundButton } from '../../../../src/admin/BillingForms';
import { DataTable } from '../../../../src/admin/DataTable';
import { FormField } from '../../../../src/admin/FormField';
import { adminServer } from '../../../../src/admin/server';
import { requireStaff } from '../../../../src/auth/session';

const date = (iso: string | null) => (iso ? formatRuDate(new Date(iso)) : '—');

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; status?: string; cursor?: string }>;
}) {
  await requireStaff('/admin/orders');
  const query = await searchParams;
  const params = new URLSearchParams();
  if (query.email) params.set('email', query.email.slice(0, 254));
  if (orderStatusSchema.safeParse(query.status).success) params.set('status', String(query.status));
  if (query.cursor) params.set('cursor', query.cursor.slice(0, 500));
  const data = await adminServer<Page<AdminOrder>>(`/billing/orders?${params}`);
  const next = new URLSearchParams(params);
  if (data.nextCursor) next.set('cursor', data.nextCursor);
  return (
    <>
      <h1>Заказы</h1>
      <form className={s.tools}>
        <FormField label="Почта">
          <input type="search" name="email" maxLength={254} defaultValue={query.email} />
        </FormField>
        <FormField label="Статус">
          <select name="status" defaultValue={query.status ?? ''}>
            <option value="">Все</option>
            {Object.entries(orderStatusLabel).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </FormField>
        <button type="submit">Найти</button>
      </form>
      <DataTable
        caption="Заказы, новые сверху"
        headings={['Почта', 'Сумма', 'Статус', 'Создан', 'Оплачен', 'Доступ', '']}
        stack
      >
        {data.items.map((o) => (
          <tr key={o.id}>
            <td data-label="Почта">
              {o.email}
              {o.userEmail && o.userEmail !== o.email && (
                <div className={s.muted}>вход: {o.userEmail}</div>
              )}
            </td>
            <td data-label="Сумма">{o.amountRub} ₽</td>
            <td data-label="Статус">
              <span className={s.badge} data-tone={orderStatusTone[o.status]}>
                {orderStatusLabel[o.status]}
              </span>
            </td>
            <td data-label="Создан">{date(o.createdAt)}</td>
            <td data-label="Оплачен">{date(o.paidAt)}</td>
            <td data-label="Доступ">
              {o.accessUntil ? (
                o.revokedAt ? (
                  <s>до {date(o.accessUntil)}</s>
                ) : (
                  `${date(o.accessStartsAt)} — ${date(o.accessUntil)}`
                )
              ) : (
                '—'
              )}
            </td>
            <td data-label="Действия">{o.status === 'paid' && <RefundButton orderId={o.id} />}</td>
          </tr>
        ))}
      </DataTable>
      {data.items.length === 0 && <p>Заказов не найдено.</p>}
      {data.nextCursor && <Link href={`/admin/orders?${next}`}>Показать ещё</Link>}
    </>
  );
}
