'use server';
import { notFound, redirect } from 'next/navigation';

/**
 * Development only (`XSTORE_DEV_PAGES=1`): plays the payment provider. Runs on the server and
 * calls the API's dev route, which sets the fake payment's status and applies it like a webhook;
 * the webhook secret never reaches the browser. The route answers with the order id, so the
 * wizard continues on exactly the order of this payment.
 */
export async function settleFakePayment(paymentId: string, action: 'pay' | 'fail') {
  if (process.env.XSTORE_DEV_PAGES !== '1') notFound();
  if (action !== 'pay' && action !== 'fail') notFound();

  const site = process.env.SITE_URL ? new URL(process.env.SITE_URL).origin : '';
  const back = `/dev/pay/${encodeURIComponent(paymentId)}?error=1`;
  let orderId: string | undefined;
  try {
    const res = await fetch(
      `${process.env.API_INTERNAL_URL}/api/v1/billing/dev/fake-payments/${encodeURIComponent(paymentId)}/${action}`,
      {
        method: 'POST',
        // The API's Origin check guards every mutation; this call speaks for the site.
        headers: { origin: site, accept: 'application/json' },
        cache: 'no-store',
      },
    );
    if (res.ok) {
      const body = (await res.json()) as { orderId?: unknown };
      if (typeof body.orderId === 'string') orderId = body.orderId;
    }
  } catch {
    // API unreachable: the page says so below.
  }
  redirect(orderId ? `/get/${encodeURIComponent(orderId)}` : back);
}
