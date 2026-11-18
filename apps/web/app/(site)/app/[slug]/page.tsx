import { redirect } from 'next/navigation';
import { orNotFound, serverApi } from '../../../../src/api/server';

type Props = { params: Promise<{ slug: string }> };

/**
 * There is no app page any more: an app opens as the install sheet over the home page
 * (owner 2026-11-18). Old links, banners and the sign-in return address land here; a hidden or
 * unknown app is still 404.
 */
export default async function AppPage({ params }: Props) {
  const { slug } = await params;
  const app = await orNotFound((await serverApi()).app(slug));
  redirect(`/?app=${encodeURIComponent(app.slug)}`);
}
