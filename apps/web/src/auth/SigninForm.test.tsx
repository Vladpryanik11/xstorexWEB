import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiClientError, ErrorCode } from '@xstore/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type SigninApi, SigninForm } from './SigninForm';

function fakeApi(over: Partial<SigninApi> = {}): SigninApi {
  return {
    login: vi.fn().mockResolvedValue(undefined),
    requestCode: vi.fn().mockResolvedValue(undefined),
    verifyCode: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

afterEach(() => {
  vi.useRealTimers();
});

describe('SigninForm, password', () => {
  it('signs in and goes to the safe next page', async () => {
    const api = fakeApi();
    const go = vi.fn();
    render(<SigninForm api={api} go={go} next="/?app=tg" />);
    type('Почта', 'buyer@example.com');
    type('Пароль', 'long-enough-1');
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    await waitFor(() => expect(go).toHaveBeenCalledWith('/?app=tg'));
    expect(api.login).toHaveBeenCalledWith({
      email: 'buyer@example.com',
      password: 'long-enough-1',
    });
  });

  it('an unsafe or missing next leads to «Мой доступ»', async () => {
    const go = vi.fn();
    render(<SigninForm api={fakeApi()} go={go} next="//evil.example" />);
    type('Почта', 'buyer@example.com');
    type('Пароль', 'long-enough-1');
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    await waitFor(() => expect(go).toHaveBeenCalledWith('/access'));
  });

  it('shows «Неверная почта или пароль» on INVALID_CREDENTIALS', async () => {
    const api = fakeApi({
      login: vi
        .fn()
        .mockRejectedValue(new ApiClientError(401, ErrorCode.INVALID_CREDENTIALS, 'bad')),
    });
    const go = vi.fn();
    render(<SigninForm api={api} go={go} />);
    type('Почта', 'buyer@example.com');
    type('Пароль', 'wrong-password');
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверная почта или пароль');
    expect(go).not.toHaveBeenCalled();
  });

  it('too many attempts get their own text', async () => {
    const api = fakeApi({
      login: vi.fn().mockRejectedValue(new ApiClientError(429, ErrorCode.RATE_LIMITED, 'slow')),
    });
    render(<SigninForm api={api} go={vi.fn()} />);
    type('Почта', 'buyer@example.com');
    type('Пароль', 'long-enough-1');
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Слишком много попыток, попробуйте позже',
    );
  });
});

describe('SigninForm, code from the email', () => {
  async function openCode(api: SigninApi, go = vi.fn()) {
    render(<SigninForm api={api} go={go} />);
    fireEvent.click(screen.getByRole('button', { name: 'Войти по коду из письма' }));
    type('Почта', 'buyer@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Получить код' }));
    await act(async () => {});
    return go;
  }

  it('the link switches to the code form and back', () => {
    render(<SigninForm api={fakeApi()} go={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Войти по коду из письма' }));
    expect(screen.queryByLabelText('Пароль')).toBeNull();
    expect(screen.getByRole('button', { name: 'Получить код' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Войти по паролю' }));
    expect(screen.getByLabelText('Пароль')).toBeInTheDocument();
  });

  it('requests a code, then signs in with it', async () => {
    const api = fakeApi();
    const go = await openCode(api);
    expect(api.requestCode).toHaveBeenCalledWith({ email: 'buyer@example.com' });
    expect(screen.getByText(/Отправили код на buyer@example.com/)).toBeInTheDocument();
    type('Код из письма', '123456');
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    await waitFor(() => expect(go).toHaveBeenCalledWith('/access'));
    expect(api.verifyCode).toHaveBeenCalledWith({ email: 'buyer@example.com', code: '123456' });
  });

  it('resend stays disabled for 60 seconds with a visible countdown', async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    await openCode(api);
    const resend = screen.getByRole('button', { name: /Отправить код повторно/ });
    expect(resend).toBeDisabled();
    expect(resend).toHaveTextContent('Отправить код повторно через 60 с');
    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(resend).toBeDisabled();
    expect(resend).toHaveTextContent('через 1 с');
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(resend).toBeEnabled();
    expect(resend).toHaveTextContent(/^Отправить код повторно$/);
    fireEvent.click(resend);
    await act(async () => {});
    expect(api.requestCode).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: /Отправить код повторно/ })).toBeDisabled();
  });

  it('a wrong code gets a human text', async () => {
    const api = fakeApi({
      verifyCode: vi.fn().mockRejectedValue(new ApiClientError(400, ErrorCode.CODE_INVALID, 'x')),
    });
    const go = await openCode(api);
    type('Код из письма', '000000');
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный или устаревший код');
    expect(go).not.toHaveBeenCalled();
  });

  it('a code request over the limit gets the 429 text', async () => {
    const api = fakeApi({
      requestCode: vi
        .fn()
        .mockRejectedValue(new ApiClientError(429, ErrorCode.RATE_LIMITED, 'slow')),
    });
    await openCode(api);
    expect(screen.getByRole('alert')).toHaveTextContent('Слишком много попыток, попробуйте позже');
    expect(screen.queryByLabelText('Код из письма')).toBeNull();
  });

  it('checks the code format before sending', async () => {
    const api = fakeApi();
    await openCode(api);
    type('Код из письма', '12a');
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Код — 6 цифр из письма');
    expect(api.verifyCode).not.toHaveBeenCalled();
  });
});
