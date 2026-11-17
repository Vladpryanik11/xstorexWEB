import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IPhoneFrame } from './IPhoneFrame';

describe('IPhoneFrame', () => {
  it('shows its content on the screen under a decorative SVG bezel', () => {
    const { container } = render(
      <IPhoneFrame>
        <img src="/s.png" alt="Скриншот 1" />
      </IPhoneFrame>,
    );
    const frame = container.querySelector('[data-iphone-frame]');
    expect(frame).not.toBeNull();
    expect(frame).toContainElement(screen.getByRole('img', { name: 'Скриншот 1' }));
    const svg = frame?.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.querySelector('image')).toBeNull();
  });
});
