import { expect, it } from 'vitest';
import { originAllowed } from './origin.middleware.js';

const SITE = 'https://xstorex.ru';

it('allows safe methods without Origin', () => {
  expect(originAllowed('GET', '/api/v1/auth/me', undefined, SITE)).toBe(true);
});

it('requires the site origin on mutations', () => {
  expect(originAllowed('POST', '/api/v1/auth/logout', SITE, SITE)).toBe(true);
  expect(originAllowed('POST', '/api/v1/auth/logout', undefined, SITE)).toBe(false);
  expect(originAllowed('DELETE', '/api/v1/x', 'https://xstorex.ru.evil.com', SITE)).toBe(false);
  expect(originAllowed('PATCH', '/api/v1/x', 'null', SITE)).toBe(false);
});

it('exempts provider callbacks', () => {
  expect(originAllowed('POST', '/api/v1/enrollment/callback?x=1', undefined, SITE)).toBe(true);
  expect(originAllowed('POST', '/api/v1/billing/webhooks/platega', undefined, SITE)).toBe(true);
  expect(originAllowed('POST', '/api/v1/billing/webhooksX', undefined, SITE)).toBe(false);
});
