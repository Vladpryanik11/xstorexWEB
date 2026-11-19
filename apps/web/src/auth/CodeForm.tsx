'use client';
import { emailSchema } from '@xstore/shared';
import { Button } from '@xstore/ui';
import { type FormEvent, useEffect, useId, useState } from 'react';
import styles from '../checkout/checkout.module.css';
import type { SigninApi } from './SigninForm';
import { signinErrorText } from './signin-errors';

/** Seconds before the same email may get another code (Global Constraints, N1). */
export const RESEND_SECONDS = 60;

export type CodeFormProps = {
  api: SigninApi;
  email: string;
  onEmail: (email: string) => void;
  /** Called once the code is accepted and the session cookie is set. */
  onSignedIn: () => void;
};

const CODE = /^\d{6}$/;

/** Sign-in by a 6-digit code from the email: «Получить код», the code, resend after 60 s. */
export function CodeForm({ api, email, onEmail, onSignedIn }: CodeFormProps) {
  const id = useId();
  const [phase, setPhase] = useState<'email' | 'code'>('email');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [left, setLeft] = useState(0);

  // One tick a second while the resend button waits; the interval lives as long as the wait.
  const waiting = left > 0;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  async function send(): Promise<boolean> {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError('Введите почту, например name@mail.ru');
      return false;
    }
    setError('');
    setBusy(true);
    try {
      await api.requestCode({ email: parsed.data });
      setLeft(RESEND_SECONDS);
      return true;
    } catch (err) {
      setError(signinErrorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function requestFirst(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (await send()) setPhase('code');
  }

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
      onSignedIn();
    } catch (err) {
      setError(signinErrorText(err));
      setBusy(false);
    }
  }

  const alert = error ? (
    <p role="alert" className={styles.problemText}>
      {error}
    </p>
  ) : null;

  if (phase === 'email') {
    return (
      <form className={styles.form} onSubmit={requestFirst} noValidate>
        <div className={styles.field}>
          <label htmlFor={`${id}-email`} className={styles.label}>
            Почта
          </label>
          <input
            id={`${id}-email`}
            className={styles.input}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => onEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
          />
          <p className={styles.hint}>Та, что вы указали при оплате.</p>
        </div>
        {alert}
        <Button type="submit" disabled={busy} className={styles.wide}>
          {busy ? 'Отправляем…' : 'Получить код'}
        </Button>
      </form>
    );
  }

  return (
    <form className={styles.form} onSubmit={verify} noValidate>
      <p className={styles.note} role="status">
        Отправили код на {email.trim()}. Он действует 10 минут.
      </p>
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
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
      </div>
      {alert}
      <Button type="submit" disabled={busy} className={styles.wide}>
        {busy ? 'Входим…' : 'Войти'}
      </Button>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.skip}
          disabled={busy || left > 0}
          onClick={() => void send()}
        >
          {left > 0 ? `Отправить код повторно через ${left}\u00a0с` : 'Отправить код повторно'}
        </button>
        <button
          type="button"
          className={styles.skip}
          onClick={() => {
            setPhase('email');
            setCode('');
            setError('');
          }}
        >
          Другая почта
        </button>
      </div>
    </form>
  );
}
