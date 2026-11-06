'use client';
import { useState } from 'react';
import { safeAdminNext } from '../auth/safe-next';
import s from './admin.module.css';
import { errorText, mutate } from './api';
import { FormField } from './FormField';

export function LoginForm({ next }: { next?: string }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={s.form}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const data = new FormData(e.currentTarget);
        try {
          await mutate('/auth/staff/login', 'POST', {
            email: data.get('email'),
            password: data.get('password'),
            totp: data.get('totp'),
          });
          location.assign(safeAdminNext(next));
        } catch (err) {
          setError(errorText(err));
          setBusy(false);
        }
      }}
    >
      <FormField label="Почта">
        <input name="email" type="email" autoComplete="username" required />
      </FormField>
      <FormField label="Пароль">
        <input name="password" type="password" autoComplete="current-password" required />
      </FormField>
      <FormField label="Код из приложения">
        <input
          name="totp"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
        />
      </FormField>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy} type="submit">
        {busy ? 'Входим…' : 'Войти'}
      </button>
    </form>
  );
}
