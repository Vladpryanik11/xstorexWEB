import 'server-only';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

/** Used only after the page's staff guard. Never cache private catalog data. */
export async function adminServer<T>(path: string): Promise<T> {
  const cookie = (await headers()).get('cookie') ?? '';
  const res = await fetch(`${process.env.API_INTERNAL_URL}/api/v1/admin${path}`, {
    headers: { cookie },
    cache: 'no-store',
  });
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error('Не удалось загрузить данные админки');
  return res.json();
}
