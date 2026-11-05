import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FactsStrip } from './FactsStrip';

const facts = [
  { label: 'Категория', value: 'Игры' },
  { label: 'Разработчик', value: 'Студия' },
  { label: 'Язык', value: 'Русский' },
  { label: 'Размер', value: '1,2 ГБ' },
  { label: 'Версия', value: '2.4.1' },
];

describe('FactsStrip', () => {
  it('renders label/value pairs', () => {
    const { container } = render(<FactsStrip facts={facts} />);
    expect(container.querySelectorAll('dt')).toHaveLength(5);
    expect(container.querySelectorAll('dd')).toHaveLength(5);
    expect(screen.getByText('Разработчик').nextElementSibling).toHaveTextContent('Студия');
  });
});
