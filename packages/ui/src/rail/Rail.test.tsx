import { act, fireEvent, render, screen } from '@testing-library/react';
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

  it('hides both blurred edges when there is nothing to scroll', () => {
    const { container } = render(<Rail label="Тенденции">{[<span key="a">A</span>]}</Rail>);
    const edges = container.querySelectorAll('[data-rail-edge]');
    expect(edges).toHaveLength(2);
    for (const edge of edges) expect(edge).toHaveAttribute('data-visible', 'false');
  });

  it('shows the blurred edge on the side that can still scroll', () => {
    const { container } = render(
      <Rail label="Тенденции">{[<span key="a">A</span>, <span key="b">B</span>]}</Rail>,
    );
    const list = screen.getByRole('list', { name: 'Тенденции' });
    Object.defineProperty(list, 'scrollWidth', { value: 1000, configurable: true });
    Object.defineProperty(list, 'clientWidth', { value: 500, configurable: true });
    const edge = (side: string) => container.querySelector(`[data-rail-edge="${side}"]`);
    act(() => {
      list.scrollLeft = 0;
      fireEvent.scroll(list);
    });
    expect(edge('start')).toHaveAttribute('data-visible', 'false');
    expect(edge('end')).toHaveAttribute('data-visible', 'true');
    act(() => {
      list.scrollLeft = 500;
      fireEvent.scroll(list);
    });
    expect(edge('start')).toHaveAttribute('data-visible', 'true');
    expect(edge('end')).toHaveAttribute('data-visible', 'false');
  });
});
