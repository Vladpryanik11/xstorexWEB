import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SectionTitle } from './SectionTitle';

describe('SectionTitle', () => {
  it('with href shows a chevron link', () => {
    render(<SectionTitle href="/list/top">Самый загружаемый</SectionTitle>);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Самый загружаемый›');
    expect(screen.getByRole('link')).toHaveAttribute('href', '/list/top');
  });

  it('without href is a plain heading', () => {
    render(<SectionTitle>Тенденции</SectionTitle>);
    expect(screen.getByRole('heading', { level: 2, name: 'Тенденции' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
