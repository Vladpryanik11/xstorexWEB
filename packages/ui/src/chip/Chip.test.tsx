import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Chip } from './Chip';

describe('Chip', () => {
  it('active sets aria-current', () => {
    render(
      <Chip href="/category/finance" active>
        Финансы
      </Chip>,
    );
    expect(screen.getByRole('link', { name: 'Финансы' })).toHaveAttribute('aria-current', 'page');
  });

  it('inactive has no aria-current', () => {
    render(<Chip href="/category/games">Игры</Chip>);
    expect(screen.getByRole('link', { name: 'Игры' })).not.toHaveAttribute('aria-current');
  });
});
