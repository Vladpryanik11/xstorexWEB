import { expect, it } from 'vitest';
import { healthSchema } from './health.js';

it('parses a healthy report', () => {
  expect(healthSchema.parse({ status: 'ok', checks: { db: 'up', redis: 'up' } }).status).toBe('ok');
});

it('rejects an unknown check state', () => {
  expect(healthSchema.safeParse({ status: 'ok', checks: { db: 'maybe' } }).success).toBe(false);
});
