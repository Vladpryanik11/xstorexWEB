import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './LoginForm';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('admin LoginForm', () => {
  it('wrong credentials name the app code too', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ code: 'INVALID_CREDENTIALS', message: 'Неверная почта или пароль' }),
            { status: 401, headers: { 'content-type': 'application/json' } },
          ),
        ),
    );
    render(<LoginForm />);
    fireEvent.submit(
      screen.getByRole('button', { name: 'Войти' }).closest('form') as HTMLFormElement,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Неверная почта, пароль или код из приложения',
    );
  });
});
