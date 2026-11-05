import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SpotBanner } from './SpotBanner';

describe('SpotBanner', () => {
  it('is a link with the title and subtitle', () => {
    const { container } = render(
      <SpotBanner href="/list/new" imageSrc="/b.png" title="Новинки" subtitle="Свежие игры" />,
    );
    const link = screen.getByRole('link', { name: /Новинки/ });
    expect(link).toHaveAttribute('href', '/list/new');
    expect(link).toHaveTextContent('Свежие игры');
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
  });

  it('works without an image', () => {
    const { container } = render(<SpotBanner href="/list/new" title="Новинки" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('link', { name: 'Новинки' })).toBeInTheDocument();
  });
});
