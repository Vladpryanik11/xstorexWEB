import { expect, it } from 'vitest';
import { isHealthCheck } from './is-health-check.js';

it('matches the health endpoint, with or without a query', () => {
  expect(isHealthCheck({ url: '/api/v1/health' })).toBe(true);
  expect(isHealthCheck({ url: '/api/v1/health?probe=1' })).toBe(true);
});

it('reads the full path when a middleware mount has stripped req.url', () => {
  expect(isHealthCheck({ originalUrl: '/api/v1/health', url: '/' })).toBe(true);
  expect(isHealthCheck({ originalUrl: '/api/v1/devices', url: '/health' })).toBe(false);
});

it('leaves every other route logged', () => {
  expect(isHealthCheck({ url: '/api/v1/healthz' })).toBe(false);
  expect(isHealthCheck({ url: '/api/v1/health/details' })).toBe(false);
  expect(isHealthCheck({ url: '/health' })).toBe(false);
  expect(isHealthCheck({ url: '/api/v1/nope' })).toBe(false);
  expect(isHealthCheck({})).toBe(false);
});
