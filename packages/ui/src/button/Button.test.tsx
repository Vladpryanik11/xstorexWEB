import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders a link when href is set', () => {
    render(<Button href="/pricing">Купить</Button>);
    expect(screen.getByRole('link', { name: 'Купить' })).toHaveAttribute('href', '/pricing');
  });

  it('disabled is aria-disabled', () => {
    render(<Button disabled>Установить</Button>);
    const button = screen.getByRole('button', { name: 'Установить' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('type', 'button');
  });

  it('a disabled link is aria-disabled and not navigable', () => {
    render(
      <Button href="/pricing" disabled>
        Купить
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Купить' });
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link).not.toHaveAttribute('href');
  });
});
