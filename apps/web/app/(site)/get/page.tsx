import { type AccessResponse, ApiClientError, type AppCard, type PlanView } from '@xstore/shared';
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

/**
 * Wizard, step 1 «Оплата». `?app=<slug>` names the app the visitor came from, `?renew=1` is
 * «Продлить» from «Мой доступ».
 */
export default async function GetPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const slug = one(params.app);
  const renew = one(params.renew) === '1';
  const api = await serverApi();
  const access: AccessResponse = await api.getAccess();
  // A subscriber never sees the payment form (spec v2 §4): without a device the wizard goes on to
  // step 2, with one «Мой доступ» leads on. «Продлить» there opens it on purpose with `?renew=1`.
  if (access.state.kind === 'active' && !renew) {
    redirect(access.state.device ? '/access' : '/get/iphone');
  }
  // No second payment while the first is unresolved (spec v2 §4): continue that order.
  if (access.state.kind === 'payment_pending') {
    redirect(`/get/${encodeURIComponent(access.state.orderId)}`);
  }

  // Icons for the plan card, the same apps as the lanes of the home page; the step opens without them.
  const section = (name: 'removed' | 'premium') =>
    api
      .section(name)
      .then((page) => page.items)
      .catch((): AppCard[] => []);
  const [plan, app, removed, premium] = await Promise.all([
    optional<PlanView>(api.getPlan()),
    slug ? optional(api.app(slug)) : Promise.resolve(null),
    section('removed'),
    section('premium'),
  ]);

  return (
    <div className={styles.wizard}>
      <StepBar current={0} />
      {plan ? (
        <PayStep
          plan={plan}
          returnTo={app ? `/app/${app.slug}` : undefined}
          defaultEmail={access.email ?? ''}
          renewUntil={access.state.kind === 'active' ? access.state.until : undefined}
          apps={[...removed, ...premium]}
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
