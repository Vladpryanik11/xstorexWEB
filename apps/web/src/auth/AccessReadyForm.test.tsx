import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiClientError, ErrorCode } from '@xstore/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccessReadyForm } from './AccessReadyForm';
import type { SigninApi } from './SigninForm';

function fakeApi(over: Partial<SigninApi> = {}): SigninApi {
  return {
    login: vi.fn().mockResolvedValue(undefined),
    requestCode: vi.fn().mockResolvedValue(undefined),
    verifyCode: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

const typeCode = (value: string) =>
  fireEvent.change(screen.getByLabelText('Код из письма'), { target: { value } });

afterEach(() => {
  vi.useRealTimers();
});

describe('AccessReadyForm (spec v2 §5 «Доступ готов»)', () => {
  it('names the email and signs in by the code, then goes to connect the iPhone', async () => {
    const api = fakeApi();
    const go = vi.fn();
    render(<AccessReadyForm email="Buyer@Example.com" api={api} go={go} />);
    expect(screen.getByRole('heading', { name: 'Доступ готов!' })).toBeInTheDocument();
    expect(
      screen.getByText('Введите код из письма, которое мы отправили на Buyer@Example.com'),
    ).toBeInTheDocument();
    typeCode(' 123456 ');
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    await waitFor(() => expect(go).toHaveBeenCalledWith('/get/iphone'));
    expect(api.verifyCode).toHaveBeenCalledWith({ email: 'buyer@example.com', code: '123456' });
  });

  it('a code that is not 6 digits never reaches the API', () => {
    const api = fakeApi();
    render(<AccessReadyForm email="buyer@example.com" api={api} go={vi.fn()} />);
    typeCode('12');
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Код — 6 цифр из письма');
    expect(api.verifyCode).not.toHaveBeenCalled();
  });

  it('a wrong code shows the error and keeps the form', async () => {
    const api = fakeApi({
      verifyCode: vi.fn().mockRejectedValue(new ApiClientError(400, ErrorCode.CODE_INVALID, '')),
    });
    const go = vi.fn();
    render(<AccessReadyForm email="buyer@example.com" api={api} go={go} />);
    typeCode('000000');
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('alert')).not.toBeEmptyDOMElement();
    expect(go).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Войти' })).toBeEnabled();
  });

  it('«Отправить код ещё раз» asks for a new code, then waits 60 seconds', async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    render(<AccessReadyForm email="buyer@example.com" api={api} go={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Отправить код ещё раз' }));
    });
    expect(api.requestCode).toHaveBeenCalledWith({ email: 'buyer@example.com' });
    expect(screen.getByRole('button', { name: /через 60/ })).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(screen.getByRole('button', { name: 'Отправить код ещё раз' })).toBeEnabled();
  });
});
