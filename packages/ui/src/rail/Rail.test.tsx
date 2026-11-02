import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Rail } from './Rail';

describe('Rail', () => {
  it('wraps each child in a list item', () => {
    render(<Rail label="Тенденции">{[<span key="a">A</span>, <span key="b">B</span>]}</Rail>);
    expect(screen.getByRole('list', { name: 'Тенденции' }).querySelectorAll('li')).toHaveLength(2);
  });

  it('arrow buttons scroll the list', () => {
    render(<Rail label="Тенденции">{[<span key="a">A</span>, <span key="b">B</span>]}</Rail>);
    const list = screen.getByRole('list', { name: 'Тенденции' });
    const scrollBy = vi.fn();
    list.scrollBy = scrollBy;
    Object.defineProperty(list, 'clientWidth', { value: 500 });
    fireEvent.click(screen.getByRole('button', { name: 'Вперёд' }));
    expect(scrollBy).toHaveBeenLastCalledWith(
      expect.objectContaining({ left: expect.any(Number) }),
    );
    expect(scrollBy.mock.lastCall?.[0].left).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(scrollBy.mock.lastCall?.[0].left).toBeLessThan(0);
  });
});
