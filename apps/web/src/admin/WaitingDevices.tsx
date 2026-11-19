'use client';
import { type WaitingDevice, waitingReasonLabel } from '@xstore/shared';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import s from './admin.module.css';
import { DataTable } from './DataTable';

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** «ждёт 3 ч», «ждёт 1 дн. 1 ч», «ждёт меньше часа». */
export function waitText(sinceIso: string, now: Date): string {
  const ms = Math.max(0, now.getTime() - new Date(sinceIso).getTime());
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  if (days === 0) return hours === 0 ? 'ждёт меньше часа' : `ждёт ${hours} ч`;
  return hours === 0 ? `ждёт ${days} дн.` : `ждёт ${days} дн. ${hours} ч`;
}

function reasonText(device: WaitingDevice, now: Date): string {
  if (device.reason !== 'expiring' || !device.expiresAt) return waitingReasonLabel[device.reason];
  const days = Math.max(0, Math.ceil((new Date(device.expiresAt).getTime() - now.getTime()) / DAY));
  return `Истекает через ${days} дн.`;
}

/** Copies the UDID; the label says «Скопировано» for 2 seconds. */
export function CopyUdid({ udid }: { udid: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <button
      type="button"
      className={s.quiet}
      aria-label="Скопировать UDID"
      onClick={async () => {
        await navigator.clipboard.writeText(udid);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2_000);
      }}
    >
      {copied ? 'Скопировано' : 'Скопировать'}
    </button>
  );
}

export function WaitingDevices({ devices, now }: { devices: WaitingDevice[]; now: Date }) {
  if (devices.length === 0) return <p>Все устройства готовы.</p>;
  return (
    <DataTable
      caption="Ждут сертификата, дольше ждущие сверху"
      headings={['Почта', 'Устройство', 'UDID', 'Причина', '']}
      stack
    >
      {devices.map((d) => (
        <tr key={d.id}>
          <td data-label="Почта">{d.email}</td>
          <td data-label="Устройство">{d.model}</td>
          <td data-label="UDID">
            <code className={s.udid}>{d.udid}</code> <CopyUdid udid={d.udid} />
          </td>
          <td data-label="Причина">
            <span className={s.badge} data-tone={d.reason === 'expiring' ? 'warn' : undefined}>
              {reasonText(d, now)}
            </span>
            {d.reason !== 'expiring' && (
              <div className={s.muted} data-tone={d.overdue ? 'err' : undefined}>
                {waitText(d.since, now)}
              </div>
            )}
          </td>
          <td>
            <Link href={`/admin/devices/${d.id}`}>Загрузить сертификат</Link>
          </td>
        </tr>
      ))}
    </DataTable>
  );
}
