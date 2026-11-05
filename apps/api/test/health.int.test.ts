import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { type AppConfig, loadConfig } from '../src/config/config.js';
import { testEnv } from './test-env.js';

let config: AppConfig;
let app: INestApplication;

beforeAll(async () => {
  config = loadConfig(testEnv());
  app = await createApp(config);
});

afterAll(async () => {
  await app.close();
});

it('reports ok', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ status: 'ok', checks: { db: 'up', redis: 'up' } });
});

it('echoes or creates x-request-id', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/health').set('x-request-id', 'abc');
  expect(res.headers['x-request-id']).toBe('abc');
  const res2 = await request(app.getHttpServer()).get('/api/v1/health');
  expect(res2.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
});

it('returns the error contract for unknown routes', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/nope');
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ code: 'NOT_FOUND', message: 'Не найдено' });
});

it('degraded health hides details', async () => {
  const broken = await createApp({ ...config, redisUrl: 'redis://127.0.0.1:1' });
  const res = await request(broken.getHttpServer()).get('/api/v1/health');
  expect(res.status).toBe(503);
  expect(res.body).toEqual({ status: 'degraded', checks: { db: 'up', redis: 'down' } });
  await broken.close();
});
