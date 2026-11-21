import {
  certificateStatusLabel,
  type DeviceCard,
  deviceStatusText,
  formatRuDate,
  waitingReasonLabel,
} from '@xstore/shared';
import Link from 'next/link';
import s from '../../../../../src/admin/admin.module.css';
import { CertificateUpload } from '../../../../../src/admin/CertificateUpload';
import { DataTable } from '../../../../../src/admin/DataTable';
import { DeleteCertificate } from '../../../../../src/admin/DeleteCertificate';
import { adminServer } from '../../../../../src/admin/server';
import { CopyUdid } from '../../../../../src/admin/WaitingDevices';
import { requireStaff } from '../../../../../src/auth/session';

const date = (iso: string) => formatRuDate(new Date(iso));

export default async function DevicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff(`/admin/devices/${id}`);
  const device = await adminServer<DeviceCard>(`/devices/${encodeURIComponent(id)}`);
  const active = device.certificates.find((c) => c.status === 'active');
  return (
    <>
      <p>
        <Link href="/admin/devices">← Ждут сертификата</Link>
      </p>
      <h1>{device.model}</h1>
      <section className={s.card} aria-label="Устройство">
        <dl className={s.facts}>
          <dt>Почта</dt>
          <dd>{device.email || '—'}</dd>
          <dt>UDID</dt>
          <dd>
            <code className={s.udid}>{device.udid}</code> <CopyUdid udid={device.udid} />
          </dd>
          <dt>Статус</dt>
          <dd>
            {device.status === 'active' ? (
              <span className={s.badge} data-tone="ok">
                Готов
              </span>
            ) : (
              deviceStatusText(device.status, device.family)
            )}
          </dd>
          <dt>Доступ</dt>
          <dd>{device.live ? 'действует' : 'закончился'}</dd>
          {device.waiting && (
            <>
              <dt>Ждёт</dt>
              <dd>
                {waitingReasonLabel[device.waiting.reason]} с {date(device.waiting.since)}
              </dd>
            </>
          )}
        </dl>
      </section>
      {device.live && <CertificateUpload deviceId={device.id} />}
      {active && <DeleteCertificate deviceId={device.id} />}
      <h2>История файлов</h2>
      {device.certificates.length === 0 ? (
        <p>Файлы ещё не загружались.</p>
      ) : (
        <DataTable
          caption="Файлы поставщика, новые сверху"
          headings={['Статус', 'Команда', 'Профиль', 'Серийный номер', 'Действует до', 'Загружен']}
          stack
        >
          {device.certificates.map((c) => (
            <tr key={c.id}>
              <td data-label="Статус">
                <span className={s.badge} data-tone={c.status === 'active' ? 'ok' : undefined}>
                  {certificateStatusLabel[c.status]}
                </span>
              </td>
              <td data-label="Команда">{c.teamId}</td>
              <td data-label="Профиль">
                {c.profileKind === 'all' ? (
                  'На все приложения'
                ) : (
                  <span className={s.badge} data-tone="warn">
                    На одно приложение
                  </span>
                )}
              </td>
              <td data-label="Серийный номер">
                <code className={s.udid}>{c.certSerial}</code>
              </td>
              <td data-label="Действует до">
                {date([c.certNotAfter, c.profileExpiresAt].sort()[0] ?? c.certNotAfter)}
              </td>
              <td data-label="Загружен">
                {date(c.createdAt)}
                {c.endedAt && <div className={s.muted}>до {date(c.endedAt)}</div>}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </>
  );
}
