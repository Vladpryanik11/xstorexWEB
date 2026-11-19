import { expect, it } from 'vitest';
import { redactRequestLog } from './log-redaction.js';

it('hides the enrollment nonce in the logged URL and query', () => {
  const out = redactRequestLog({
    method: 'POST',
    url: '/api/v1/enrollment/callback?s=secret-nonce&x=1',
    query: { s: 'secret-nonce', x: '1' },
  });
  expect(JSON.stringify(out)).not.toContain('secret-nonce');
  expect(out.url).toBe('/api/v1/enrollment/callback?s=%E2%80%A6&x=1');
  expect(out.query).toEqual({ s: '…', x: '1' });
});

it('leaves other requests alone', () => {
  const req = { method: 'GET', url: '/api/v1/catalog/search?s=abc', query: { s: 'abc' } };
  expect(redactRequestLog(req)).toEqual(req);
});
