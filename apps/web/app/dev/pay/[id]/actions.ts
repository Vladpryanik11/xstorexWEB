'use server';
import { accessResponseSchema } from '@xstore/shared';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

const api = (path: string) => `${process.env.API_INTERNAL_URL}/api/v1${path}`;

/**
 * Development only (`XSTORE_DEV_PAGES=1`): plays the payment provider. Runs on the server and
 * calls the API's dev route, which sets the fake payment's status and applies it like a webhook;
 * the webhook secret never reaches the browser.
 */
export async function settleFakePayment(paymentId: string, action: 'pay' | 'fail') {
  if (process.env.XSTORE_DEV_PAGES !== '1') notFound();
  if (action !== 'pay' && action !== 'fail') notFound();
  const cookie = (await headers()).get('cookie');

  // The payment id is the provider's; the buyer's pending order tells where to come back.
  let orderId: string | null = null;
  const accessRes = await fetch(api('/access'), {
    headers: cookie ? { cookie } : {},
    cache: 'no-store',
  });
  if (accessRes.ok) {
    const access = accessResponseSchema.safeParse(await accessRes.json());
    if (access.success && access.data.state.kind === 'payment_pending') {
      orderId = access.data.state.orderId;
    }
  }

  const site = process.env.SITE_URL ? new URL(process.env.SITE_URL).origin : '';
  const res = await fetch(
    api(`/billing/dev/fake-payments/${encodeURIComponent(paymentId)}/${action}`),
    {
      method: 'POST',
      // The API's Origin check guards every mutation; this call speaks for the site.
      headers: { origin: site, accept: 'application/json' },
      cache: 'no-store',
    },
  );
  if (!res.ok) throw new Error(`Fake payment ${action} failed: ${res.status}`);
  redirect(orderId ? `/get/${orderId}` : '/access');
}
