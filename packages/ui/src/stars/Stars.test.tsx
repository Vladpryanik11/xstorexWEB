import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Stars } from './Stars';

describe('Stars', () => {
  it('announces the rating in Russian', () => {
    render(<Stars value={4.5} count={1234} />);
    expect(screen.getByLabelText('Рейтинг 4,5 из 5')).toBeInTheDocument();
  });

  it('shows the rating count in a compact Russian form', () => {
    render(<Stars value={4.5} count={1234} />);
    expect(screen.getByText('1,2 тыс.')).toBeInTheDocument();
  });

  it('clamps the value to 0..5', () => {
    render(<Stars value={7} />);
    expect(screen.getByLabelText('Рейтинг 5,0 из 5')).toBeInTheDocument();
  });
});
