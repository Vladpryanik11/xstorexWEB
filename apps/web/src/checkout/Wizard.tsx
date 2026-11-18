'use client';
import type { OrderView, SetPassword } from '@xstore/shared';
import { formatRuDate } from '@xstore/shared';
import { Button } from '@xstore/ui';
import { useEffect, useState } from 'react';
import { browserApi } from './browser-api';
import styles from './checkout.module.css';
import { clearCheckoutKey } from './checkout-key';
import { PaidStep } from './PaidStep';
import { StepBar } from './StepBar';
import { POLL_INTERVAL_MS, POLL_LIMIT_MS, wizardStep } from './wizard-step';

export type WizardProps = {
  initialOrder: OrderView;
  hasPassword: boolean;
  devPages?: boolean;
  getOrder?: (id: string) => Promise<OrderView>;
  setPassword?: (body: SetPassword) => Promise<void>;
};

const defaultGetOrder = (id: string) => browserApi().getOrder(id);

/** `/get?app=<slug>` for the app the order came from (`returnTo` is `/app/<slug>`). */
function payAgainHref(returnTo: string | null): string {
  const slug = returnTo?.match(/^\/app\/([^/?#]+)$/)?.[1];
  return slug ? `/get?app=${slug}` : '/get';
}

/** The provider's payment page, only as a plain web link. */
const payable = (url: string | null): url is string => !!url && /^https?:\/\//.test(url);

/** `/get/[orderId]`: waits for the provider's confirmation, then shows the access. */
export function Wizard({
  initialOrder,
  hasPassword,
  devPages = false,
  getOrder = defaultGetOrder,
  setPassword,
}: WizardProps) {
  const [order, setOrder] = useState(initialOrder);
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const step = wizardStep({ order, access: { kind: 'none' } });
  const orderId = order.id;
  // A buyer who left the payment page can always go back to it while the order is open.
  const backToPayment = payable(order.paymentUrl) ? (
    <Button variant="quiet" href={order.paymentUrl} className={styles.wide}>
      Вернуться к оплате
    </Button>
  ) : null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` restarts the two-minute window after «Проверить ещё раз»
  useEffect(() => {
    if (step !== 'checking' || timedOut) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + POLL_LIMIT_MS;
    const schedule = () => {
      timer = setTimeout(async () => {
        if (stopped) return;
        if (Date.now() >= deadline) {
          setTimedOut(true);
          return;
        }
        try {
          const next = await getOrder(orderId);
          if (stopped) return;
          setOrder(next);
          if (wizardStep({ order: next, access: { kind: 'none' } }) !== 'checking') return;
        } catch {
          // A failed check is retried on the next tick.
        }
        if (!stopped) schedule();
      }, POLL_INTERVAL_MS);
    };
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [step, timedOut, attempt, orderId, getOrder]);

  useEffect(() => {
    if (step === 'paid' || step === 'failed') clearCheckoutKey();
  }, [step]);

  const status =
    step === 'paid'
      ? order.accessUntil
        ? `Доступ активен до ${formatRuDate(new Date(order.accessUntil))}`
        : 'Доступ активен'
      : step === 'failed'
        ? order.status === 'expired'
          ? 'Время на оплату истекло'
          : 'Оплата не прошла'
        : timedOut
          ? 'Оплата ещё не подтвердилась'
          : 'Проверяем оплату…';

  return (
    <div className={styles.wizard}>
      {/* One polite announcement per change of state; the panels below are not live. */}
      <p role="status" aria-live="polite" className={styles.srOnly} data-testid="wizard-status">
        {status}
      </p>
      <StepBar current={step === 'paid' ? 1 : 0} />
      {step === 'paid' ? (
        <PaidStep
          until={order.accessUntil ? new Date(order.accessUntil) : null}
          hasPassword={hasPassword}
          devPages={devPages}
          returnTo={order.returnTo}
          setPassword={setPassword}
        />
      ) : step === 'failed' ? (
        <section className={styles.panel}>
          <h1 className={styles.title}>
            {order.status === 'expired' ? 'Время на оплату истекло' : 'Оплата не прошла'}
          </h1>
          <p className={styles.lead}>Доступ не оформлен. Попробуйте оплатить ещё раз.</p>
          <Button href={payAgainHref(order.returnTo)} className={styles.wide}>
            Попробовать ещё раз
          </Button>
        </section>
      ) : timedOut ? (
        <section className={styles.panel}>
          <h1 className={styles.title}>Оплата ещё не подтвердилась</h1>
          <p className={styles.lead}>
            Иногда банку нужно чуть больше времени. Если вы оплатили, доступ откроется сам —
            проверьте ещё раз через минуту.
          </p>
          <Button
            className={styles.wide}
            onClick={() => {
              setTimedOut(false);
              setAttempt((n) => n + 1);
            }}
          >
            Проверить ещё раз
          </Button>
          {backToPayment}
        </section>
      ) : (
        <section className={styles.panel} aria-busy="true">
          <span className={styles.spinner} aria-hidden="true" />
          <h1 className={styles.title}>Проверяем оплату…</h1>
          <p className={styles.lead}>
            Обычно это занимает несколько секунд. Не закрывайте страницу.
          </p>
          {backToPayment}
        </section>
      )}
    </div>
  );
}
