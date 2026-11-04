import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ErrorPage from './error';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

it('error page apologises in Russian inside the site shell and offers a retry', () => {
  const retry = vi.fn();
  render(<ErrorPage error={new Error('db password=secret')} retry={retry} />);

  expect(
    screen.getByRole('heading', { level: 1, name: 'Что-то пошло не так' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('banner')).toBeInTheDocument();
  expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  // The raw error never reaches the page.
  expect(screen.queryByText(/secret/)).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }));
  expect(retry).toHaveBeenCalledOnce();
});
