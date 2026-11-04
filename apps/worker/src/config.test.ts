import { expect, it } from 'vitest';
import { loadWorkerConfig } from './config.js';

it('requires REDIS_URL', () => {
  expect(() => loadWorkerConfig({})).toThrow(/REDIS_URL/);
});

it('defaults concurrency to 4', () => {
  expect(loadWorkerConfig({ REDIS_URL: 'redis://x' }).concurrency).toBe(4);
});
