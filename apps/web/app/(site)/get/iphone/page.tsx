import { HANDOFF_PARAM } from '@xstore/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { serverApi } from '../../../../src/api/server';
import { ConnectStep } from '../../../../src/checkout/ConnectStep';
import { HandoffRedeem } from '../../../../src/checkout/HandoffRedeem';

export const metadata: Metadata = {
  title: 'Подключить iPhone',
  robots: { index: false, follow: false },
  // `?h=` carries a one-time sign-in: never in a Referer.
  referrer: 'no-referrer',
};

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Wizard step 2 «Подключить iPhone» (spec v2 §4). iOS comes back here from the API callback with
 * `?r=connected` or `?r=<error code>`; `?h=<token>` is the one-time sign-in from another browser.
 */
export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const handoff = one(params[HANDOFF_PARAM]);
  // Spec v2 §4 step 2a: a link from another browser signs this one in first.
  if (handoff) return <HandoffRedeem token={handoff} />;
  const result = one(params.r) ?? null;
  const api = await serverApi();
  const access = await api.getAccess();
  // `hasPassword` comes only with a buyer session; the connect link needs one.
  if (access.hasPassword === undefined) redirect('/signin?next=/get/iphone');
  return <ConnectStep access={access.state} result={result} />;
}
