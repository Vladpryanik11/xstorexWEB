import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppRow } from './AppRow';

describe('AppRow', () => {
  it('links the name and subtitle to the app page', () => {
    render(<AppRow href="/app/tg" name="Телеграм" subtitle="Мессенджер" />);
    const link = screen.getByRole('link', { name: /Телеграм/ });
    expect(link).toHaveAttribute('href', '/app/tg');
    expect(link).toHaveTextContent('Мессенджер');
  });

  it('renders the action outside the link', () => {
    render(
      <AppRow
        href="/app/tg"
        name="Телеграм"
        action={
          <button type="button" aria-label="Получить">
            Получить
          </button>
        }
      />,
    );
    const link = screen.getByRole('link', { name: /Телеграм/ });
    expect(link).not.toContainElement(screen.getByRole('button', { name: 'Получить' }));
  });
});
