import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiClientError, type CheckoutRequest, ErrorCode } from '@xstore/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PayStep } from './PayStep';
import { CHECKOUT_KEY_STORAGE } from './wizard-step';

const plan = { code: 'month', title: 'Месяц', durationDays: 30, priceRub: 299 };

function setup(
  checkout = vi.fn().mockResolvedValue({ orderId: 'o1', redirectUrl: '/dev/pay/p1' }),
) {
  const navigate = vi.fn();
  render(<PayStep plan={plan} checkout={checkout} navigate={navigate} />);
  const button = screen.getByRole('button', { name: /Оплатить/ });
  const email = screen.getByLabelText('Почта');
  const terms = screen.getByRole('checkbox', { name: /Согласен с условиями/ });
  return { checkout, navigate, button, email, terms };
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('PayStep', () => {
  it('shows the plan facts and links the terms', () => {
    setup();
    expect(screen.getByText('1 месяц')).toBeInTheDocument();
    expect(screen.getByText('для одного iPhone')).toBeInTheDocument();
    expect(screen.getByText('Подписка начнётся сразу после оплаты')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'условиями' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'обработкой персональных данных' })).toHaveAttribute(
      'href',
      '/consent',
    );
  });

  it('button is disabled without email and the checkbox', () => {
    const { button, email, terms } = setup();
    expect(button).toBeDisabled();
    fireEvent.change(email, { target: { value: 'buyer@example.com' } });
    expect(button).toBeDisabled();
    fireEvent.click(terms);
    expect(button).toBeEnabled();
    fireEvent.change(email, { target: { value: '' } });
    expect(button).toBeDisabled();
  });

  it('the disabled button says what is missing', () => {
    const { button, email, terms } = setup();
    expect(button).toHaveAccessibleDescription('Введите почту и отметьте согласие с условиями.');
    fireEvent.change(email, { target: { value: 'buyer@example.com' } });
    expect(button).toHaveAccessibleDescription('Отметьте согласие с условиями.');
    fireEvent.change(email, { target: { value: '' } });
    fireEvent.click(terms);
    expect(button).toHaveAccessibleDescription('Введите почту.');
    fireEvent.change(email, { target: { value: 'buyer@example.com' } });
    expect(button).not.toHaveAttribute('aria-describedby');
  });

  it('button reads «Оплатить 299 ₽» for the price 299', () => {
    const { button } = setup();
    expect(button.textContent?.replace(/\s/g, ' ')).toBe('Оплатить 299 ₽');
  });

  it('pressing again sends the same checkoutKey', async () => {
    const { checkout, navigate, button, email, terms } = setup();
    fireEvent.change(email, { target: { value: 'buyer@example.com' } });
    fireEvent.click(terms);
    fireEvent.click(button);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dev/pay/p1'));
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(checkout).toHaveBeenCalledTimes(2));
    const [first, second] = checkout.mock.calls.map((c) => c[0] as CheckoutRequest);
    expect(first?.checkoutKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(second?.checkoutKey).toBe(first?.checkoutKey);
    expect(first).toMatchObject({ email: 'buyer@example.com', acceptTerms: true });
  });

  it('a failed checkout offers to try again with a new key', async () => {
    const checkout = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiClientError(503, ErrorCode.PAYMENT_PROVIDER_DOWN, 'Платёжный сервис не отвечает'),
      )
      .mockResolvedValue({ orderId: 'o1', redirectUrl: '/dev/pay/p1' });
    const { button, email, terms } = setup(checkout);
    fireEvent.change(email, { target: { value: 'buyer@example.com' } });
    fireEvent.click(terms);
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Платёжный сервис не отвечает. Попробуйте через минуту',
    );
    const retry = screen.getByRole('button', { name: 'Попробовать ещё раз' });
    await waitFor(() => expect(retry).toHaveFocus());
    fireEvent.click(retry);
    fireEvent.click(screen.getByRole('button', { name: /Оплатить/ }));
    await waitFor(() => expect(checkout).toHaveBeenCalledTimes(2));
    const [first, second] = checkout.mock.calls.map((c) => c[0] as CheckoutRequest);
    expect(second?.checkoutKey).not.toBe(first?.checkoutKey);
  });

  it('coming from an app: no app block, only the catalog offer; the app is kept for after payment', async () => {
    const checkout = vi.fn().mockResolvedValue({ orderId: 'o4', redirectUrl: '/dev/pay/p4' });
    render(<PayStep plan={plan} returnTo="/app/okko" checkout={checkout} navigate={vi.fn()} />);
    // The subscription is for the whole catalog: no «Вы выбрали <app>» that reads like a single purchase.
    expect(screen.queryByText('Вы выбрали')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Доступ ко всему каталогу' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Почта'), { target: { value: 'buyer@example.com' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Согласен с условиями/ }));
    fireEvent.click(screen.getByRole('button', { name: /Оплатить/ }));
    await waitFor(() => expect(checkout).toHaveBeenCalledTimes(1));
    expect((checkout.mock.calls[0]?.[0] as CheckoutRequest | undefined)?.returnTo).toBe(
      '/app/okko',
    );
  });

  it('renewal: the new end date instead of «Подписка начнётся сразу после оплаты»', () => {
    render(
      <PayStep
        plan={plan}
        renewUntil={new Date('2026-12-18T12:00:00Z')}
        checkout={vi.fn()}
        navigate={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Продление доступа' })).toBeInTheDocument();
    expect(screen.getByText('Доступ продлится до 17 января 2027')).toBeInTheDocument();
    expect(screen.queryByText('Подписка начнётся сразу после оплаты')).toBeNull();
  });

  it('a key of a settled order is replaced by a new one and the checkout is retried once', async () => {
    sessionStorage.setItem(CHECKOUT_KEY_STORAGE, 'old-key');
    const checkout = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiClientError(409, ErrorCode.CHECKOUT_SETTLED, 'Эта оплата уже завершена'),
      )
      .mockResolvedValue({ orderId: 'o2', redirectUrl: '/dev/pay/p2' });
    const { navigate, button, email, terms } = setup(checkout);
    fireEvent.change(email, { target: { value: 'buyer@example.com' } });
    fireEvent.click(terms);
    fireEvent.click(button);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dev/pay/p2'));
    const [first, second] = checkout.mock.calls.map((c) => c[0] as CheckoutRequest);
    expect(first?.checkoutKey).toBe('old-key');
    expect(second?.checkoutKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(sessionStorage.getItem(CHECKOUT_KEY_STORAGE)).toBe(second?.checkoutKey);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retries a settled key only once, then shows the error', async () => {
    const settled = new ApiClientError(409, ErrorCode.CHECKOUT_SETTLED, 'x');
    const checkout = vi.fn().mockRejectedValue(settled);
    const { button, email, terms } = setup(checkout);
    fireEvent.change(email, { target: { value: 'buyer@example.com' } });
    fireEvent.click(terms);
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(checkout).toHaveBeenCalledTimes(2);
  });

  it('renewal starts with a new key, not one left in sessionStorage', async () => {
    sessionStorage.setItem(CHECKOUT_KEY_STORAGE, 'old-key');
    const checkout = vi.fn().mockResolvedValue({ orderId: 'o3', redirectUrl: '/dev/pay/p3' });
    render(
      <PayStep
        plan={plan}
        renewUntil={new Date('2026-12-18T12:00:00Z')}
        checkout={checkout}
        navigate={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Почта'), { target: { value: 'buyer@example.com' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Согласен с условиями/ }));
    fireEvent.click(screen.getByRole('button', { name: /Оплатить/ }));
    await waitFor(() => expect(checkout).toHaveBeenCalledTimes(1));
    const key = (checkout.mock.calls[0]?.[0] as CheckoutRequest | undefined)?.checkoutKey;
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(key).not.toBe('old-key');
    expect(sessionStorage.getItem(CHECKOUT_KEY_STORAGE)).toBe(key);
  });
});
