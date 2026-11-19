'use client';
import { ApiClientError, ErrorCode, errorMessages, type SetPassword } from '@xstore/shared';
import { Button } from '@xstore/ui';
import { type FormEvent, useId, useState } from 'react';
import { browserApi } from './browser-api';
import styles from './checkout.module.css';

export type PasswordFormProps = {
  setPassword?: (body: SetPassword) => Promise<void>;
  /** «Придумайте пароль» in the wizard, «Задать пароль» on «Мой доступ». */
  title?: string;
  /** The wizard lets the buyer skip; «Мой доступ» keeps the form until a password is set. */
  skippable?: boolean;
};

const defaultSetPassword = (body: SetPassword) => browserApi().setPassword(body);

function passwordErrorText(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.code === ErrorCode.WEAK_PASSWORD || err.code === ErrorCode.RATE_LIMITED) {
      return errorMessages[err.code];
    }
  }
  return 'Не получилось сохранить пароль. Попробуйте ещё раз.';
}

/** «Придумайте пароль» after payment; skipping leaves sign-in by a code from the email. */
export function PasswordForm({
  setPassword = defaultSetPassword,
  title = 'Придумайте пароль',
  skippable = true,
}: PasswordFormProps) {
  const id = useId();
  const [password, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'skipped'>('idle');
  const [error, setError] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password.length < 8 || password.length > 128) {
      setError(errorMessages.WEAK_PASSWORD);
      return;
    }
    setError('');
    setState('saving');
    try {
      await setPassword({ password });
      setState('saved');
    } catch (err) {
      setError(passwordErrorText(err));
      setState('idle');
    }
  }

  if (state === 'saved') {
    return (
      <p className={styles.done} role="status">
        Пароль сохранён. Входите по почте и паролю.
      </p>
    );
  }
  if (state === 'skipped') {
    return (
      <p className={styles.note}>Хорошо. Войти можно будет по коду из письма на вашу почту.</p>
    );
  }

  return (
    <form className={styles.subpanel} onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.subtitle}>
        {title}
      </h2>
      <p className={styles.note}>
        {skippable
          ? 'Чтобы входить по почте и паролю. Можно пропустить — тогда войдёте по коду из письма.'
          : 'Чтобы входить по почте и паролю, а не только по коду из письма.'}
      </p>
      <div className={styles.field}>
        <label htmlFor={id} className={styles.label}>
          Пароль
        </label>
        <input
          id={id}
          className={styles.input}
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          value={password}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
        <p className={styles.hint}>Не короче 8 символов.</p>
      </div>
      {error ? (
        <p role="alert" className={styles.problemText}>
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        <Button type="submit" disabled={state === 'saving'}>
          {state === 'saving' ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        {skippable ? (
          <button type="button" className={styles.skip} onClick={() => setState('skipped')}>
            Пропустить
          </button>
        ) : null}
      </div>
    </form>
  );
}
