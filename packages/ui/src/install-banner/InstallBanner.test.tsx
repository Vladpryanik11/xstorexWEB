import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InstallBanner } from './InstallBanner';

describe('InstallBanner', () => {
  it('shows the Xstore pitch and an install link', () => {
    render(<InstallBanner href="/install" />);
    const banner = screen.getByRole('complementary', { name: 'Установить Xstore' });
    expect(banner).toHaveTextContent('Xstore');
    expect(banner).toHaveTextContent('Больше приложений');
    expect(screen.getByRole('link', { name: 'Установить' })).toHaveAttribute('href', '/install');
  });
});
