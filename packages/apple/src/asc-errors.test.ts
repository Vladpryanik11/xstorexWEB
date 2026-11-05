import { describe, expect, it } from 'vitest';
import { AscError, classifyAscError } from './asc-errors.js';

describe('Apple error classification', () => {
  it.each([
    [401, {}, 'auth'],
    [403, {}, 'auth'],
    [429, {}, 'rate_limited'],
    [404, {}, 'not_found'],
    [409, { errors: [{ detail: 'A device with this UDID already exists.' }] }, 'already_exists'],
    [409, { errors: [{ detail: 'The maximum number of devices has been reached.' }] }, 'no_slots'],
    [
      409,
      { errors: [{ detail: 'The maximum number of certificates has been reached.' }] },
      'cert_limit',
    ],
    [500, { errors: [{ detail: 'private-key-value' }] }, 'other'],
    [409, null, 'other'],
    [409, { errors: [{ detail: 12 }] }, 'other'],
  ] as const)('classifies status %i as %s', (status, body, expected) => {
    expect(classifyAscError(status, body)).toBe(expected);
  });
  it('provides a safe error without response bodies or key material', () => {
    const error = new AscError('auth', 401, 15);
    expect(error.kind).toBe('auth');
    expect(error.status).toBe(401);
    expect(error.retryAfterSec).toBe(15);
    expect(error.message).not.toMatch(/PRIVATE KEY|Bearer/);
  });
});
