import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiClientError, ErrorCode } from '@xstore/shared';
import { describe, expect, it, vi } from 'vitest';
import type { SigninApi } from './SigninForm';
import { readLinkHash, SigninLink, SigninLinkFromLocation } from './SigninLink';

function fakeApi(over: Partial<SigninApi> = {}): SigninApi {
  return {
    login: vi.fn().mockResolvedValue(undefined),
    requestCode: vi.fn().mockResolvedValue(undefined),
    verifyCode: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

const FALLBACK = '/signin?next=/get/iphone&mode=code';

describe('readLinkHash', () => {
  it('reads the email and the 6-digit code from the fragment', () => {
    expect(readLinkHash('#e=Buyer%40example.com&c=123456')).toEqual({
      email: 'buyer@example.com',
      code: '123456',
    });
  });

  it.each(['', '#', '#e=buyer%40example.com', '#e=not-an-email&c=123456', '#e=a%40b.ru&c=12ab56'])(
    'gives null for %j',
    (hash) => {
      expect(readLinkHash(hash)).toBeNull();
    },
  );
});

describe('/signin/link (spec v2 §5)', () => {
  it('spends the code only on the button, then goes to connect the iPhone', async () => {
    const api = fakeApi();
    const go = vi.fn();
    render(<SigninLink hash="#e=buyer%40example.com&c=123456" api={api} go={go} />);
    expect(api.verifyCode).not.toHaveBeenCalled();
    expect(screen.getByText('buyer@example.com', { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Войти и подключить iPhone' }));
    await waitFor(() => expect(go).toHaveBeenCalledWith('/get/iphone'));
    expect(api.verifyCode).toHaveBeenCalledWith({ email: 'buyer@example.com', code: '123456' });
  });

  it('a stale or wrong code points to the code sign-in', async () => {
    const api = fakeApi({
      verifyCode: vi.fn().mockRejectedValue(new ApiClientError(400, ErrorCode.CODE_INVALID, '')),
    });
    const go = vi.fn();
    render(<SigninLink hash="#e=buyer%40example.com&c=123456" api={api} go={go} />);
    fireEvent.click(screen.getByRole('button', { name: 'Войти и подключить iPhone' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ссылка устарела. Войдите по коду из письма',
    );
    expect(screen.getByRole('link', { name: 'Войти по коду' })).toHaveAttribute('href', FALLBACK);
    expect(go).not.toHaveBeenCalled();
  });

  it('reads the code from the address bar once and wipes it from there', async () => {
    window.history.replaceState(null, '', '/signin/link#e=buyer%40example.com&c=123456');
    render(<SigninLinkFromLocation />);
    expect(
      await screen.findByRole('button', { name: 'Войти и подключить iPhone' }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/signin/link');
  });

  it('a broken link shows the same way out without a button', () => {
    render(<SigninLink hash="" api={fakeApi()} go={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ссылка устарела. Войдите по коду из письма',
    );
    expect(screen.queryByRole('button', { name: 'Войти и подключить iPhone' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Войти по коду' })).toHaveAttribute('href', FALLBACK);
  });
});
