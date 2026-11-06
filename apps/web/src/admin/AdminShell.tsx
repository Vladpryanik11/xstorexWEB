'use client';
import type { MeResponse } from '@xstore/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import s from './admin.module.css';
import { errorText, mutate } from './api';

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
  const links =
    session?.user.role === 'admin'
      ? [
          ['/admin/apps', 'Приложения'],
          ['/admin/collections', 'Подборки'],
          ['/admin/categories', 'Категории'],
          ['/admin/jobs', 'Задания'],
        ]
      : [['/admin/jobs', 'Задания']];
  return (
    <div className={s.shell}>
      <header className={s.header}>
        <Link href="/">Xstore</Link>
        <span>Управление каталогом</span>
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
