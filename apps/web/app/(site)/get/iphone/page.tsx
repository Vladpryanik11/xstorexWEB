import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { serverApi } from '../../../../src/api/server';
import { ConnectStep } from '../../../../src/checkout/ConnectStep';

export const metadata: Metadata = {
  title: 'Подключить iPhone',
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Wizard step 2 «Подключить iPhone» (spec v2 §4). iOS comes back here from the API callback with
 * `?r=connected` or `?r=<error code>`.
 */
export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const result = one((await searchParams).r) ?? null;
  const api = await serverApi();
  const access = await api.getAccess();
  // `hasPassword` comes only with a buyer session; the connect link needs one.
  if (access.hasPassword === undefined) redirect('/signin?next=/get/iphone');
  return <ConnectStep access={access.state} result={result} />;
}
