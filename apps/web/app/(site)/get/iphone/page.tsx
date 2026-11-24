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
  const params = await searchParams;
  const result = one(params.r) ?? null;
  // Developer Mode first, then the profile (owner 2026-11-24, variant Б): «Готово, дальше» adds `?dev=ok`.
  const devMode = one(params.dev) === 'ok' ? 'done' : 'ask';
  const api = await serverApi();
  const access = await api.getAccess();
  // `hasPassword` comes only with a buyer session; the connect link needs one.
  if (access.hasPassword === undefined) redirect('/signin?next=/get/iphone');
  // Step 3 installs the app the buyer paid from; without it the step points to the catalog.
  const ready = access.state.kind === 'active' && access.state.device?.ready === true;
  const chosen = ready ? ((await api.chosenApp().catch(() => null))?.app ?? null) : null;
  return <ConnectStep access={access.state} result={result} chosen={chosen} devMode={devMode} />;
}
