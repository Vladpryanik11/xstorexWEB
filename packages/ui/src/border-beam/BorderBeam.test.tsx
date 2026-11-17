import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BorderBeam } from './BorderBeam';

describe('BorderBeam', () => {
  it('wraps content and adds a decorative beam', () => {
    const { container } = render(
      <BorderBeam>
        <p>Идёт подпись</p>
      </BorderBeam>,
    );
    expect(screen.getByText('Идёт подпись')).toBeVisible();
    const beam = container.querySelector('[data-border-beam]');
    expect(beam).toHaveAttribute('aria-hidden', 'true');
  });
});
