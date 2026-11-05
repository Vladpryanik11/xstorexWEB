import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Cover } from './Cover';

describe('Cover', () => {
  it('renders the image with its alt text', () => {
    render(<Cover src="/s.png" alt="Скриншот" />);
    expect(screen.getByRole('img', { name: 'Скриншот' })).toHaveAttribute('src', '/s.png');
  });

  it('without src keeps a labelled placeholder and renders children', () => {
    render(
      <Cover alt="Скриншот">
        <span>Подпись</span>
      </Cover>,
    );
    expect(screen.getByRole('img', { name: 'Скриншот' }).tagName).toBe('DIV');
    expect(screen.getByText('Подпись')).toBeInTheDocument();
  });
});
