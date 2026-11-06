import 'server-only';
import type { MeResponse } from '@xstore/shared';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

export const getSession = cache(async (): Promise<MeResponse | null> => {
  const cookie = (await headers()).get('cookie');
  if (!cookie) return null;
  const res = await fetch(`${process.env.API_INTERNAL_URL}/api/v1/auth/me`, {
    headers: { cookie },
    cache: 'no-store',
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Не удалось проверить сессию');
  return res.json();
});

export async function requireStaff(next: string, adminOnly = true): Promise<MeResponse> {
  const session = await getSession();
  if (session?.session.kind !== 'staff' || !['admin', 'support'].includes(session.user.role))
    redirect(`/admin/login?next=${encodeURIComponent(next)}`);
  if (adminOnly && session.user.role !== 'admin') redirect('/admin/jobs');
  return session;
}
