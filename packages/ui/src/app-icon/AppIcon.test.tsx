import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppIcon } from './AppIcon';

describe('AppIcon', () => {
  it('without src renders a placeholder with the alt text', () => {
    render(<AppIcon alt="Телеграм" size={56} />);
    const img = screen.getByRole('img', { name: 'Телеграм' });
    expect(img.tagName).toBe('SPAN');
  });

  it('with src renders an image of the requested size', () => {
    render(<AppIcon src="/i.png" alt="Телеграм" size={120} />);
    const img = screen.getByRole('img', { name: 'Телеграм' });
    expect(img).toHaveAttribute('src', '/i.png');
    expect(img).toHaveAttribute('width', '120');
    expect(img).toHaveAttribute('height', '120');
  });

  it('is hidden from assistive tech when alt is empty', () => {
    const { container } = render(<AppIcon alt="" size={76} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
