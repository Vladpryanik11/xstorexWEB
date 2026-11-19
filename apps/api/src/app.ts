import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule, type AppOptions } from './app.module.js';
import type { AppConfig } from './config/config.js';
import {
  ENROLLMENT_CALLBACK_PATH,
  enrollmentResultUrl,
} from './enrollment/enrollment.controller.js';

const WEBHOOK_PATH = '/api/v1/billing/webhooks/';

export async function createApp(
  config: AppConfig,
  options: AppOptions = {},
): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config, options), {
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
  // The signed answer iOS posts to the profile service: raw bytes of any type, ≤ 64 KB. A body
  // the parser refuses (too large, bad encoding) still sends iOS back to the wizard.
  const isCallback = (req: { originalUrl?: string; url?: string }) =>
    (req.originalUrl ?? req.url ?? '').split('?')[0] === ENROLLMENT_CALLBACK_PATH;
  app.useBodyParser('raw', { type: isCallback, limit: '64kb' });
  app.use(
    ENROLLMENT_CALLBACK_PATH,
    (
      _err: unknown,
      _req: unknown,
      res: { redirect(status: number, url: string): void },
      _next: unknown,
    ) => {
      res.redirect(301, enrollmentResultUrl(config.siteUrl, 'ENROLLMENT_FAILED'));
    },
  );
  app.enableShutdownHooks();
  await app.init();
  return app;
}
