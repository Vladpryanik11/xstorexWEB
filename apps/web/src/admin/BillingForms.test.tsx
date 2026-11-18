import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GrantForm, PlanForm, RefundButton } from './BillingForms';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  refresh.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const sent = () => {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, method: init.method, body: JSON.parse(String(init.body)) };
};

const plan = {
  id: 'p1',
  code: 'month',
  title: 'Подписка на месяц',
  durationDays: 30,
  priceRub: 299,
  active: true,
};

describe('PlanForm', () => {
  it('sends the price as whole rubles', async () => {
    fetchMock.mockResolvedValue(json({ ...plan, priceRub: 499 }));
    render(<PlanForm initial={plan} />);
    fireEvent.change(screen.getByLabelText('Цена, ₽'), { target: { value: '499' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить тариф' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Сохранено');
    expect(sent()).toEqual({
      url: '/api/v1/admin/billing/plan',
      method: 'PATCH',
      body: { title: 'Подписка на месяц', priceRub: 499, active: true },
    });
  });

  it('shows the server error', async () => {
    fetchMock.mockResolvedValue(json({ code: 'VALIDATION', message: 'Некорректные данные' }, 400));
    render(<PlanForm initial={plan} />);
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить тариф' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Некорректные данные');
  });
});

describe('GrantForm', () => {
  it('grants days to an email and names the new end date', async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          subscriptionId: 's1',
          startsAt: '2026-11-18T09:00:00.000Z',
          expiresAt: '2026-12-18T09:00:00.000Z',
        },
        201,
      ),
    );
    render(<GrantForm />);
    fireEvent.change(screen.getByLabelText('Почта'), { target: { value: 'friend@example.ru' } });
    fireEvent.change(screen.getByLabelText('Дней'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Комментарий'), { target: { value: 'Тестер' } });
    fireEvent.click(screen.getByRole('button', { name: 'Выдать доступ' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Доступ выдан: friend@example.ru, до 18 декабря 2026',
    );
    expect(sent()).toEqual({
      url: '/api/v1/admin/billing/grants',
      method: 'POST',
      body: { email: 'friend@example.ru', days: 30, note: 'Тестер' },
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('shows why a staff email is refused', async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          code: 'GRANT_STAFF_EMAIL',
          message: 'Эта почта принадлежит сотруднику, выдать на неё доступ нельзя',
        },
        409,
      ),
    );
    render(<GrantForm />);
    fireEvent.change(screen.getByLabelText('Почта'), { target: { value: 'admin@xstorex.ru' } });
    fireEvent.click(screen.getByRole('button', { name: 'Выдать доступ' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('принадлежит сотруднику');
  });
});

describe('RefundButton', () => {
  it('asks to confirm, then marks the refund with a note', async () => {
    fetchMock.mockResolvedValue(json({ id: 'o1', status: 'refunded' }, 201));
    render(<RefundButton orderId="o1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Отметить возврат' }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Комментарий к возврату'), {
      target: { value: 'Вернули в Platega' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить возврат' }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(sent()).toEqual({
      url: '/api/v1/admin/billing/orders/o1/refund',
      method: 'POST',
      body: { note: 'Вернули в Platega' },
    });
  });

  it('cancel closes the confirmation without a request', () => {
    render(<RefundButton orderId="o1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Отметить возврат' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.getByRole('button', { name: 'Отметить возврат' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
