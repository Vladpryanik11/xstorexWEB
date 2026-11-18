'use client';
import {
  ApiClientError,
  type CheckoutRequest,
  type CheckoutResponse,
  ErrorCode,
  errorMessages,
  formatRuDate,
  type PlanView,
} from '@xstore/shared';
import { AppIcon, Button } from '@xstore/ui';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { browserApi } from './browser-api';
import styles from './checkout.module.css';
import { newCheckoutKey, readCheckoutKey } from './checkout-key';
import { formatRub } from './wizard-step';

export type PayStepProps = {
  plan: PlanView;
  /** The app the visitor came from, shown above the price. */
  app?: { name: string; iconUrl?: string } | null;
  /** Where the wizard leads after payment, e.g. `/app/<slug>`. */
  returnTo?: string;
  defaultEmail?: string;
  /** «Продлить»: the current end of access; the plan's days are added after it. */
  renewUntil?: Date;
  checkout?: (body: CheckoutRequest) => Promise<CheckoutResponse>;
  navigate?: (url: string) => void;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/** Human text for a failed checkout: never a status code or an internal word. */
function checkoutErrorText(err: unknown): string {
  if (err instanceof ApiClientError) {
    switch (err.code) {
      case ErrorCode.VALIDATION:
        return 'Проверьте адрес почты и попробуйте ещё раз.';
      case ErrorCode.RATE_LIMITED:
      case ErrorCode.PAYMENT_PROVIDER_DOWN:
      case ErrorCode.PLAN_UNAVAILABLE:
      case ErrorCode.CHECKOUT_IN_PROGRESS:
        return errorMessages[err.code];
      default:
        break;
    }
  }
  return 'Не получилось перейти к оплате. Попробуйте ещё раз.';
}

const defaultCheckout = (body: CheckoutRequest) => browserApi().checkout(body);
const defaultNavigate = (url: string) => window.location.assign(url);

/** Step 1 of the wizard: plan, email, consent and «Оплатить N ₽». */
export function PayStep({
  plan,
  app,
  returnTo,
  defaultEmail = '',
  renewUntil,
  checkout = defaultCheckout,
  navigate = defaultNavigate,
}: PayStepProps) {
  const emailId = useId();
  const hintId = useId();
  const missingId = useId();
  const problemRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState(defaultEmail);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // One key per opened form: a double press or a reload continues the same order.
  const key = useRef<string | null>(null);

  const emailOk = looksLikeEmail(email);
  const ready = emailOk && accepted && !busy;
  const missing = busy
    ? ''
    : !emailOk && !accepted
      ? 'Введите почту и отметьте согласие с условиями.'
      : !emailOk
        ? 'Введите почту.'
        : !accepted
          ? 'Отметьте согласие с условиями.'
          : '';

  // After a failed checkout the form is replaced: keep keyboard and screen reader users in place.
  useEffect(() => {
    if (error) problemRef.current?.querySelector('button')?.focus();
  }, [error]);
  const price = formatRub(plan.priceRub);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready) return;
    key.current ??= readCheckoutKey();
    setBusy(true);
    try {
      const { redirectUrl } = await checkout({
        checkoutKey: key.current,
        email: email.trim(),
        acceptTerms: true,
        ...(returnTo ? { returnTo } : {}),
      });
      navigate(redirectUrl);
    } catch (err) {
      setError(checkoutErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    // A new key, not the failed one: if the failed request left an order that this browser cannot
    // continue (e.g. a 409 for another session, or a lost cookie), the old key would fail again.
    // With the session cookie the API still finds the buyer's open order, so no second payment.
    key.current = newCheckoutKey();
    setError('');
  }

  return (
    <section className={styles.panel} aria-labelledby={`${emailId}-title`}>
      <h1 id={`${emailId}-title`} className={styles.title}>
        {renewUntil ? 'Продление доступа' : 'Доступ ко всему каталогу'}
      </h1>

      {app ? (
        <div className={styles.app}>
          <AppIcon src={app.iconUrl} alt="" size={56} />
          <div className={styles.appText}>
            <span className={styles.caption}>Вы выбрали</span>
            <span className={styles.appName}>{app.name}</span>
          </div>
        </div>
      ) : null}

      <div className={styles.offer}>
        <p className={styles.price}>{price}</p>
        <ul className={styles.facts}>
          <li className={styles.fact}>1 месяц</li>
          <li className={styles.fact}>для одного iPhone</li>
          <li className={styles.fact}>все приложения каталога</li>
        </ul>
        <p className={styles.note}>
          {renewUntil
            ? // Renewal starts at the end of the current term (Global Constraints, N1).
              `Доступ продлится до ${formatRuDate(new Date(renewUntil.getTime() + plan.durationDays * DAY_MS))}`
            : 'Подписка начнётся сразу после оплаты'}
        </p>
      </div>

      {error ? (
        <div className={styles.problem} ref={problemRef}>
          <p role="alert" className={styles.problemText}>
            {error}
          </p>
          <Button variant="quiet" onClick={retry}>
            Попробовать ещё раз
          </Button>
        </div>
      ) : (
        <form className={styles.form} onSubmit={submit} noValidate>
          <div className={styles.field}>
            <label htmlFor={emailId} className={styles.label}>
              Почта
            </label>
            <input
              id={emailId}
              className={styles.input}
              type="email"
              name="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.ru"
              aria-describedby={hintId}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <p id={hintId} className={styles.hint}>
              Сюда придёт письмо об оплате и код для входа.
            </p>
          </div>
          <label className={styles.check}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>
              Согласен с{' '}
              <a href="/terms" className={styles.link}>
                условиями
              </a>
            </span>
          </label>
          <Button
            type="submit"
            disabled={!ready}
            className={styles.wide}
            aria-describedby={missing ? missingId : undefined}
          >
            {busy ? 'Переходим к оплате…' : `Оплатить ${price}`}
          </Button>
          {missing ? (
            <p id={missingId} className={styles.missing}>
              {missing}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
