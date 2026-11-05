import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MoreText } from './MoreText';

const text = 'Первая строка описания.\nВторая строка.\nТретья строка.\nЧетвёртая строка.';

describe('MoreText', () => {
  it('expands on «ещё»', () => {
    render(<MoreText text={text} />);
    const paragraph = screen.getByText(/Первая строка/);
    expect(paragraph).toHaveAttribute('data-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'ещё' }));
    expect(screen.queryByRole('button', { name: 'ещё' })).not.toBeInTheDocument();
    expect(paragraph).toHaveAttribute('data-expanded', 'true');
    expect(paragraph).toHaveTextContent('Четвёртая строка.');
  });

  it('passes the line count to CSS', () => {
    render(<MoreText text={text} lines={5} />);
    expect(screen.getByText(/Первая строка/).style.getPropertyValue('--lines')).toBe('5');
  });
});
