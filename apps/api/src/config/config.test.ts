import { expect, it } from 'vitest';
import { loadConfig } from './config.js';

it('parses a valid env', () => {
  expect(
    loadConfig({
      DATABASE_URL: 'postgresql://a',
      REDIS_URL: 'redis://b',
      SITE_URL: 'http://localhost:3000',
    }),
  ).toMatchObject({ port: 3001, logLevel: 'info' });
});

it('names every missing variable', () => {
  expect(() => loadConfig({})).toThrow(/DATABASE_URL.*REDIS_URL|REDIS_URL.*DATABASE_URL/s);
});
