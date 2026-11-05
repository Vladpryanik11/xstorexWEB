import { expect, it } from 'vitest';
import { clearedSessionCookie, readCookie, sessionCookie } from './session-cookie.js';

it('builds the session cookie with Secure only for https sites', () => {
  const expires = new Date(Date.now() + 60_000);
  expect(sessionCookie('tok', expires, false)).toMatch(
    /^xs_session=tok; Path=\/; Expires=.+; Max-Age=\d+; HttpOnly; SameSite=Lax$/,
  );
  expect(sessionCookie('tok', expires, true)).toMatch(/; Secure$/);
  expect(clearedSessionCookie(false)).toMatch(/^xs_session=; Path=\/; Expires=Thu, 01 Jan 1970/);
});

it('reads a cookie by exact name', () => {
  expect(readCookie('a=1; xs_session=abc; b=2', 'xs_session')).toBe('abc');
  expect(readCookie('xs_session_old=abc', 'xs_session')).toBeUndefined();
  expect(readCookie('xs_session=', 'xs_session')).toBeUndefined();
  expect(readCookie(undefined, 'xs_session')).toBeUndefined();
});
