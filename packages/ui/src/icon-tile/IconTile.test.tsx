import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IconTile } from './IconTile';

describe('IconTile', () => {
  it('is a link named after the app with a 76px icon', () => {
    const { container } = render(<IconTile href="/app/tg" iconSrc="/i.png" name="Телеграм" />);
    expect(screen.getByRole('link', { name: 'Телеграм' })).toHaveAttribute('href', '/app/tg');
    expect(container.querySelector('img')).toHaveAttribute('width', '76');
  });
});
