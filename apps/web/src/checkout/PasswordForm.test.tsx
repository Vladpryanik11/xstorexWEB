import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiClientError, ErrorCode } from '@xstore/shared';
import { describe, expect, it, vi } from 'vitest';
import { PasswordForm } from './PasswordForm';

const field = () => screen.getByLabelText('Пароль');

describe('PasswordForm', () => {
  it('saves the password', async () => {
    const setPassword = vi.fn().mockResolvedValue(undefined);
    render(<PasswordForm setPassword={setPassword} />);
    expect(screen.getByRole('heading', { name: 'Придумайте пароль' })).toBeInTheDocument();
    fireEvent.change(field(), { target: { value: 'long-enough-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(setPassword).toHaveBeenCalledWith({ password: 'long-enough-1' }));
    expect(await screen.findByText(/Пароль сохранён/)).toBeInTheDocument();
  });

  it('shows a human message for a weak password', async () => {
    const setPassword = vi
      .fn()
      .mockRejectedValue(new ApiClientError(400, ErrorCode.WEAK_PASSWORD, 'weak'));
    render(<PasswordForm setPassword={setPassword} />);
    fireEvent.change(field(), { target: { value: 'long-enough-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Пароль должен быть от 8 до 128 символов',
    );
  });

  it('checks the length before sending', () => {
    const setPassword = vi.fn();
    render(<PasswordForm setPassword={setPassword} />);
    fireEvent.change(field(), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Пароль должен быть от 8 до 128 символов');
    expect(setPassword).not.toHaveBeenCalled();
  });

  it('can be skipped', () => {
    render(<PasswordForm setPassword={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Пропустить' }));
    expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument();
    expect(screen.getByText(/по коду из письма/)).toBeInTheDocument();
  });

  it('«Задать пароль» on «Мой доступ»: own title, no skipping', () => {
    render(<PasswordForm setPassword={vi.fn()} title="Задать пароль" skippable={false} />);
    expect(screen.getByRole('heading', { name: 'Задать пароль' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Пропустить' })).toBeNull();
  });
});
