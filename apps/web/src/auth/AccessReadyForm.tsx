'use client';
import { emailSchema, safeNext } from '@xstore/shared';
import { Button } from '@xstore/ui';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { browserApi } from '../checkout/browser-api';
import styles from '../checkout/checkout.module.css';
import { RESEND_SECONDS } from './CodeForm';
import type { SigninApi } from './SigninForm';
import { signinErrorText } from './signin-errors';

export type AccessReadyFormProps = {
  /** The guest's checkout email; the grant letter went there. */
  email: string;
  /** Where to go after the code is accepted. */
  next?: string;
  api?: SigninApi;
  go?: (url: string) => void;
};

const CODE = /^\d{6}$/;

const defaultGo = (url: string) => window.location.assign(url);

const defaultApi: SigninApi = {
  login: (body) => browserApi().login(body),
  requestCode: (body) => browserApi().requestCode(body),
  verifyCode: (body) => browserApi().verifyCode(body),
};

/** «Доступ готов!» for a guest whose access was opened on their email (spec v2 §5). */
export function AccessReadyForm({
  email,
  next = '/get/iphone',
  api = defaultApi,
  go = defaultGo,
}: AccessReadyFormProps) {
  const id = useId();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [left, setLeft] = useState(0);

  const waiting = left > 0;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = code.trim();
    if (!CODE.test(value)) {
      setError('Код — 6 цифр из письма');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await api.verifyCode({ email: emailSchema.parse(email), code: value });
      go(safeNext(next, '/get/iphone'));
    } catch (err) {
      setError(signinErrorText(err));
      setBusy(false);
    }
  }

  async function resend() {
    setError('');
    setBusy(true);
    try {
      await api.requestCode({ email: emailSchema.parse(email) });
      setLeft(RESEND_SECONDS);
    } catch (err) {
      setError(signinErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.form}>
      <h2 className={styles.title}>Доступ готов!</h2>
      <p className={styles.lead}>Введите код из письма, которое мы отправили на {email}</p>
      <form className={styles.form} onSubmit={verify} noValidate>
        <div className={styles.field}>
          <label htmlFor={`${id}-code`} className={styles.label}>
            Код из письма
          </label>
          <input
            id={`${id}-code`}
            className={styles.input}
            type="text"
            name="code"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-invalid={error ? true : undefined}
          />
        </div>
        {error ? (
          <p role="alert" className={styles.problemText}>
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy} className={styles.wide}>
          {busy ? 'Входим…' : 'Войти'}
        </Button>
      </form>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.skip}
          disabled={busy || left > 0}
          onClick={() => void resend()}
        >
          {left > 0 ? `Отправить код ещё раз через ${left} с` : 'Отправить код ещё раз'}
        </button>
      </div>
    </div>
  );
}
