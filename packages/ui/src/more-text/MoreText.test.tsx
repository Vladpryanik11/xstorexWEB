import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MoreText } from './MoreText';

const text = 'Первая строка описания.\nВторая строка.\nТретья строка.\nЧетвёртая строка.';

describe('MoreText', () => {
  it('expands on «ещё»', () => {
    const { container } = render(<MoreText text={text} />);
    const paragraph = container.querySelector('[data-expanded]') as HTMLElement;
    expect(paragraph).toHaveAttribute('data-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'ещё' }));
    expect(screen.queryByRole('button', { name: 'ещё' })).not.toBeInTheDocument();
    expect(paragraph).toHaveAttribute('data-expanded', 'true');
    expect(paragraph).toHaveTextContent('Четвёртая строка.');
  });

  it('passes the line count to CSS', () => {
    const { container } = render(<MoreText text={text} lines={5} />);
    expect(
      (container.querySelector('[data-expanded]') as HTMLElement).style.getPropertyValue('--lines'),
    ).toBe('5');
  });
});

describe('MoreText with groups', () => {
  it('renders headings and lists from the text', () => {
    render(<MoreText text={'Вступление.\nЧто внутри:\n• Чаты\n• Звонки'} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ещё' }));
    expect(screen.getByText('Что внутри').tagName).toBe('H3');
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Чаты', 'Звонки']);
    expect(screen.getByText('Вступление.').tagName).toBe('P');
  });
});
