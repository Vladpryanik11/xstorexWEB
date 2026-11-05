import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchField } from './SearchField';

describe('SearchField', () => {
  it('is a search landmark with the default placeholder', () => {
    render(<SearchField />);
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Приложения, игры и другое')).toHaveAttribute(
      'type',
      'search',
    );
  });

  it('submits the typed query', () => {
    const onSubmit = vi.fn();
    render(<SearchField name="q" defaultValue="банк" onSubmit={onSubmit} />);
    fireEvent.submit(screen.getByRole('search'));
    expect(onSubmit).toHaveBeenCalledWith('банк');
  });

  it('submits natively to the given action', () => {
    render(<SearchField action="/search" />);
    const form = screen.getByRole('search');
    expect(form).toHaveAttribute('action', '/search');
    expect(form).toHaveAttribute('method', 'get');
  });
});
