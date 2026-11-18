import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/config.js';

const WEBHOOK_PATH = '/api/v1/billing/webhooks/';

export async function createApp(config: AppConfig): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  // Caddy (and Next.js in dev) proxy from private networks; req.ip is the client's address.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.setGlobalPrefix('api/v1');
  // Payment webhooks are authenticated over the exact bytes, so they get the raw body (≤ 64 KB).
  // Registered before Nest's JSON parser, which then skips the already-read body.
  app.useBodyParser('raw', {
    type: (req: { originalUrl?: string; url?: string }) =>
      (req.originalUrl ?? req.url ?? '').startsWith(WEBHOOK_PATH),
    limit: '64kb',
  });
  app.enableShutdownHooks();
  await app.init();
  return app;
}
