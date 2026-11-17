import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Stepper } from './Stepper';

const steps = [
  { title: 'Откройте Safari', description: 'Только Safari умеет ставить профиль' },
  { title: 'Скачайте профиль' },
  { title: 'Установите профиль' },
];

describe('Stepper', () => {
  it('lists steps in order and marks the current one', () => {
    render(<Stepper label="Подключение iPhone" steps={steps} current={1} />);
    const list = screen.getByRole('list', { name: 'Подключение iPhone' });
    const items = screen.getAllByRole('listitem');
    expect(list.tagName).toBe('OL');
    expect(items).toHaveLength(3);
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).toHaveAttribute('data-state', 'complete');
    expect(items[2]).toHaveAttribute('data-state', 'upcoming');
    expect(items[0]).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Только Safari умеет ставить профиль')).toBeVisible();
  });
});
