'use client';
import type { MeResponse } from '@xstore/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import s from './admin.module.css';
import { adminRequest, errorText, mutate } from './api';

export function AdminShell({
  session,
  children,
}: {
  session: MeResponse | null;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isAdmin = session?.user.role === 'admin';
  const [waiting, setWaiting] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshed on every navigation
  useEffect(() => {
    if (!isAdmin) return;
    adminRequest<{ count: number }>('/admin/devices/waiting/count')
      .then((r) => setWaiting(r.count))
      .catch(() => setWaiting(0));
  }, [isAdmin, path]);
  const links =
    session?.user.role === 'admin'
      ? [
          ['/admin/apps', 'Приложения'],
          ['/admin/collections', 'Подборки'],
          ['/admin/categories', 'Категории'],
          ['/admin/jobs', 'Задания'],
          ['/admin/plan', 'Тариф'],
          ['/admin/orders', 'Заказы'],
          ['/admin/subscriptions', 'Подписки'],
          ['/admin/devices', 'Ждут сертификата'],
        ]
      : [['/admin/jobs', 'Задания']];
  return (
    <div className={s.shell}>
      <header className={s.header}>
        <Link href="/">Xstore</Link>
        <span>Управление магазином</span>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await mutate('/auth/logout', 'POST');
              location.assign('/admin/login');
            } catch (err) {
              setError(errorText(err));
              setBusy(false);
            }
          }}
        >
          Выйти
        </button>
      </header>
      <nav className={s.nav} aria-label="Администрирование">
        {links.map(([href, label]) => (
          <Link
            key={href}
            href={href ?? '/admin'}
            aria-current={path.startsWith(href ?? '') ? 'page' : undefined}
          >
            {label}
            {href === '/admin/devices' && waiting > 0 && <span className={s.count}>{waiting}</span>}
          </Link>
        ))}
      </nav>
      <main className={s.main}>
        {error && <p role="alert">{error}</p>}
        {children}
      </main>
    </div>
  );
}
