'use client';
import { type ApiClient, emailSchema, safeNext } from '@xstore/shared';
import { Button } from '@xstore/ui';
import { type FormEvent, useId, useState } from 'react';
import { browserApi } from '../checkout/browser-api';
import styles from '../checkout/checkout.module.css';
import { CodeForm } from './CodeForm';
import { signinErrorText } from './signin-errors';

export type SigninApi = Pick<ApiClient, 'login' | 'requestCode' | 'verifyCode'>;

export type SigninFormProps = {
  /** `?next=`; only an internal path is followed, otherwise «Мой доступ». */
  next?: string;
  api?: SigninApi;
  /** Full page load, so the header and the server pages see the new session cookie. */
  go?: (url: string) => void;
  /** `?mode=code` opens the sign-in by a code from the email. */
  initialMode?: 'password' | 'code';
};

const defaultGo = (url: string) => window.location.assign(url);

/** Lazy: the browser client is created on the first call, not while the module loads. */
const defaultApi: SigninApi = {
  login: (body) => browserApi().login(body),
  requestCode: (body) => browserApi().requestCode(body),
  verifyCode: (body) => browserApi().verifyCode(body),
};

/** `/signin`: email and password, or a code from the email (spec v2 §5). */
export function SigninForm({
  next,
  api = defaultApi,
  go = defaultGo,
  initialMode = 'password',
}: SigninFormProps) {
  const id = useId();
  const [mode, setMode] = useState<'password' | 'code'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const done = () => go(safeNext(next, '/access'));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success || password.length === 0) {
      setError('Введите почту и пароль');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await api.login({ email: parsed.data, password });
      done();
    } catch (err) {
      setError(signinErrorText(err, 'password'));
      setBusy(false);
    }
  }

  const switchTo = (to: 'password' | 'code') => {
    setError('');
    setMode(to);
  };

  return (
    <div className={styles.form}>
      {mode === 'password' ? (
        <form className={styles.form} onSubmit={submit} noValidate>
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
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error ? true : undefined}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor={`${id}-password`} className={styles.label}>
              Пароль
            </label>
            <input
              id={`${id}-password`}
              className={styles.input}
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
      ) : (
        <CodeForm api={api} email={email} onEmail={setEmail} onSignedIn={done} />
      )}
      <div className={styles.actions}>
        {mode === 'password' ? (
          <button type="button" className={styles.skip} onClick={() => switchTo('code')}>
            Войти по коду из письма
          </button>
        ) : (
          <button type="button" className={styles.skip} onClick={() => switchTo('password')}>
            Войти по паролю
          </button>
        )}
      </div>
    </div>
  );
}
