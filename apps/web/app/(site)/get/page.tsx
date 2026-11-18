import { type AccessResponse, ApiClientError, type PlanView } from '@xstore/shared';
import { Button } from '@xstore/ui';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { serverApi } from '../../../src/api/server';
import styles from '../../../src/checkout/checkout.module.css';
import { PayStep } from '../../../src/checkout/PayStep';
import { StepBar } from '../../../src/checkout/StepBar';

export const metadata: Metadata = {
  title: 'Оформление доступа',
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

async function optional<T>(call: Promise<T>): Promise<T | null> {
  try {
    return await call;
  } catch (err) {
    if (err instanceof ApiClientError && err.status < 500) return null;
    throw err;
  }
}

/** Wizard, step 1 «Оплата». `?app=<slug>` names the app the visitor came from. */
export default async function GetPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const slug = one((await searchParams).app);
  const api = await serverApi();
  const access: AccessResponse = await api.getAccess();
  // A subscriber never sees the payment form (spec v2 §4); «Мой доступ» leads on from there.
  if (access.state.kind === 'active') redirect('/access');
  // No second payment while the first is unresolved (spec v2 §4): continue that order.
  if (access.state.kind === 'payment_pending') {
    redirect(`/get/${encodeURIComponent(access.state.orderId)}`);
  }

  const [plan, app] = await Promise.all([
    optional<PlanView>(api.getPlan()),
    slug ? optional(api.app(slug)) : Promise.resolve(null),
  ]);

  return (
    <div className={styles.wizard}>
      <StepBar current={0} />
      {plan ? (
        <PayStep
          plan={plan}
          app={app ? { name: app.name, iconUrl: app.iconUrl } : null}
          returnTo={app ? `/app/${app.slug}` : undefined}
          defaultEmail={access.email ?? ''}
        />
      ) : (
        <section className={styles.panel}>
          <h1 className={styles.title}>Оплата скоро откроется</h1>
          <p className={styles.lead}>Сейчас оформить доступ нельзя. Загляните чуть позже.</p>
          <Button variant="quiet" href="/" className={styles.wide}>
            В каталог
          </Button>
        </section>
      )}
    </div>
  );
}
