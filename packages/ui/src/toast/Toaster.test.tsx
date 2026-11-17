import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Toaster, toast } from './Toaster';

describe('Toaster', () => {
  it('shows a toast in Xstore styling', async () => {
    render(<Toaster />);
    act(() => {
      toast('Сохранено');
    });
    const item = await screen.findByText('Сохранено');
    expect(item.closest('[data-sonner-toast]')).not.toBeNull();
  });
});
