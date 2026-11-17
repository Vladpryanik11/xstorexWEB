import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SIGNING_STAGES, StagedProgress } from './StagedProgress';

describe('StagedProgress', () => {
  it('is a progressbar that names the current stage', () => {
    render(<StagedProgress stages={SIGNING_STAGES} value={60} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '60');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuetext', 'Загрузка, 60%');
    expect(screen.getByText('Загрузка')).toBeVisible();
  });

  it('clamps and lands on the first and last stages', () => {
    const { rerender } = render(<StagedProgress stages={SIGNING_STAGES} value={-5} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      'Регистрация устройства, 0%',
    );
    rerender(<StagedProgress stages={SIGNING_STAGES} value={140} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Установка, 100%');
  });

  it('uses the signing stages from the spec', () => {
    expect(SIGNING_STAGES).toEqual(['Регистрация устройства', 'Подпись', 'Загрузка', 'Установка']);
  });
});
