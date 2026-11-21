import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConsentPage from '../../app/(site)/consent/page';
import LegalPage from '../../app/(site)/legal/page';
import PrivacyPage from '../../app/(site)/privacy/page';
import RefundsPage from '../../app/(site)/refunds/page';
import TermsPage from '../../app/(site)/terms/page';

afterEach(() => {
  vi.unstubAllEnvs();
});

const headings = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

describe('legal pages', () => {
  it('/terms: the user agreement with the DDE Store sections, without Developer Mode', () => {
    render(<TermsPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Пользовательское соглашение',
    );
    expect(headings()).toEqual([
      '1. Описание сервиса',
      '2. Возраст и ответственность',
      '3. Подключение устройства',
      '4. Тариф и оплата',
      '5. Защита от отзыва',
      '6. Когда доступ заканчивается',
      '7. Допустимое использование',
      '8. Доступность сервиса',
      '9. Ограничение ответственности',
      '10. Изменение соглашения',
      '11. Контакты',
    ]);
    expect(screen.getByText(/не продлевается автоматически/)).toBeInTheDocument();
    expect(screen.queryByText(/[Рр]ежим разработчика/)).toBeNull();
  });

  it('/privacy: what we collect and that the server is outside Russia', () => {
    render(<PrivacyPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Политика конфиденциальности',
    );
    expect(headings()).toHaveLength(11);
    expect(screen.getByText(/серийный номер или IMEI/)).toBeInTheDocument();
    expect(screen.getByText(/за пределами Российской Федерации/)).toBeInTheDocument();
  });

  it('/consent: a separate consent with cross-border transfer and withdrawal', () => {
    render(<ConsentPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Согласие на обработку персональных данных',
    );
    expect(screen.getByText(/трансграничную передачу/)).toBeInTheDocument();
    expect(headings()).toContain('Как отозвать согласие');
  });

  it('/refunds: 7 days, the cases and the payout time', () => {
    render(<RefundsPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Возврат средств');
    expect(screen.getByText(/в течение 7 дней с покупки/)).toBeInTheDocument();
    expect(screen.getByText(/от 5 до 10 рабочих дней/)).toBeInTheDocument();
    expect(screen.getByText(/от 2 до 3 рабочих дней/)).toBeInTheDocument();
  });

  it('/legal: contacts without the owner’s personal data, Telegram only when set', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPPORT_EMAIL', 'help@xstorex.app');
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_URL', '');
    render(<LegalPage />);
    const main = screen.getByRole('article');
    expect(within(main).getByRole('link', { name: 'help@xstorex.app' })).toHaveAttribute(
      'href',
      'mailto:help@xstorex.app',
    );
    expect(within(main).queryByRole('link', { name: /Telegram/ })).toBeNull();
    expect(screen.queryByText(/ИНН|ОГРН/)).toBeNull();
  });

  it('every page shows the update date and the support email', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPPORT_EMAIL', 'help@xstorex.app');
    for (const Page of [TermsPage, PrivacyPage, ConsentPage, RefundsPage]) {
      const { unmount } = render(<Page />);
      expect(screen.getByText('Обновлено 21 ноября 2026')).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: 'help@xstorex.app' }).length).toBeGreaterThan(0);
      unmount();
    }
  });
});
