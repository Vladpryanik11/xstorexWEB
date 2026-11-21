import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FaqPage from '../../app/(site)/faq/page';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/faq', () => {
  it('has the DDE Store sections in their order, with a jump list', () => {
    render(<FaqPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Вопросы');
    const sections = [
      'До покупки',
      'С чего начать',
      'Устройства',
      'Приложения',
      'Тариф и оплата',
      'Установка и переустановка',
      'Поддержка',
      'Оплатить сейчас, подключить позже',
    ];
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(
      sections,
    );
    const nav = screen.getByRole('navigation', { name: 'Разделы вопросов' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(sections);
  });

  it('answers open on tap', () => {
    render(<FaqPage />);
    const q = screen.getByText('Нужен ли компьютер или Mac?');
    const details = q.closest('details');
    expect(details).not.toHaveAttribute('open');
    fireEvent.click(q);
    expect(details).toHaveAttribute('open');
  });

  it('tells the truth about Xstorex where it differs from DDE Store', () => {
    render(<FaqPage />);
    expect(screen.queryByText(/[Рр]ежим разработчика/)).toBeNull();
    expect(screen.queryByText(/код активации/)).toBeNull();
    expect(screen.getByText(/до 24 часов/)).toBeInTheDocument();
    expect(screen.getByText(/Да, подписка продлевается автоматически/)).toBeInTheDocument();
    expect(screen.getByText(/Сразу после оплаты/)).toBeInTheDocument();
  });

  it('links the refund rules, the privacy policy and the support email', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPPORT_EMAIL', 'help@xstorex.app');
    render(<FaqPage />);
    expect(screen.getByRole('link', { name: 'правилах возврата' })).toHaveAttribute(
      'href',
      '/refunds',
    );
    expect(screen.getByRole('link', { name: 'политике конфиденциальности' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(screen.getAllByRole('link', { name: 'help@xstorex.app' })[0]).toHaveAttribute(
      'href',
      'mailto:help@xstorex.app',
    );
  });
});
