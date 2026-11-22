import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Velaris } from './Velaris';

describe('Velaris', () => {
  it('shows content over a decorative canvas', () => {
    const { container } = render(
      <Velaris>
        <p>Ваш iPhone</p>
      </Velaris>,
    );
    expect(screen.getByText('Ваш iPhone')).toBeVisible();
    const canvas = container.querySelector('canvas');
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders without WebGL and keeps the extra class', () => {
    const { container } = render(<Velaris className="hero-bg" />);
    expect(container.firstElementChild).toHaveClass('hero-bg');
  });
});
