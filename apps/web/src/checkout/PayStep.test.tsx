import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiClientError, type CheckoutRequest, ErrorCode } from '@xstore/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PayStep } from './PayStep';

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
    fireEvent.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));
    fireEvent.click(screen.getByRole('button', { name: /Оплатить/ }));
    await waitFor(() => expect(checkout).toHaveBeenCalledTimes(2));
    const [first, second] = checkout.mock.calls.map((c) => c[0] as CheckoutRequest);
    expect(second?.checkoutKey).not.toBe(first?.checkoutKey);
  });
});
