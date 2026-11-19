import type { IncomingMessage, ServerResponse } from 'node:http';
import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { AdminBillingModule } from './admin-billing/admin-billing.module.js';
import { AdminCatalogModule } from './admin-catalog/admin-catalog.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BillingModule } from './billing/billing.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { redactRequestLog } from './common/log-redaction.js';
import { resolveRequestId } from './common/request-id.js';
import type { AppConfig } from './config/config.js';
import { EnrollmentModule } from './enrollment/enrollment.module.js';
import { HealthController } from './health/health.controller.js';
import { HealthService } from './health/health.service.js';
import { isHealthCheck } from './health/is-health-check.js';
import { InfraModule } from './infra/infra.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { RateLimitModule } from './rate-limit/rate-limit.module.js';
import { StorageModule } from './storage/storage.module.js';
import { UploadsModule } from './uploads/uploads.module.js';

/** Test seams; production passes none. */
export type AppOptions = {
  /** Where logs go instead of stdout (tests inspect them). */
  logStream?: DestinationStream;
};

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic modules are configured through a static forRoot
export class AppModule {
  static forRoot(config: AppConfig, options: AppOptions = {}): DynamicModule {
    const pinoHttp = {
      level: config.logLevel,
      genReqId: (req: IncomingMessage, res: ServerResponse) => resolveRequestId(req, res),
      serializers: { req: redactRequestLog },
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.totp',
        'res.headers["set-cookie"]',
      ],
      autoLogging: { ignore: (req: IncomingMessage) => isHealthCheck(req) },
    };
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: options.logStream ? [pinoHttp, options.logStream] : pinoHttp,
        }),
        InfraModule.forRoot(config),
        AuditModule,
        RateLimitModule,
        AuthModule,
        StorageModule,
        UploadsModule,
        CatalogModule,
        AdminCatalogModule,
        JobsModule,
        BillingModule,
        AdminBillingModule,
        EnrollmentModule.forRoot(config),
      ],
      controllers: [HealthController],
      providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }, HealthService],
    };
  }
}
