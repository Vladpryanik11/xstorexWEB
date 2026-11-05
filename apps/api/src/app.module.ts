import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AdminCatalogModule } from './admin-catalog/admin-catalog.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { resolveRequestId } from './common/request-id.js';
import type { AppConfig } from './config/config.js';
import { EnrollmentModule } from './enrollment/enrollment.module.js';
import { HealthController } from './health/health.controller.js';
import { HealthService } from './health/health.service.js';
import { isHealthCheck } from './health/is-health-check.js';
import { InfraModule } from './infra/infra.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { ProfileModule } from './profile/profile.module.js';
import { RateLimitModule } from './rate-limit/rate-limit.module.js';
import { StorageModule } from './storage/storage.module.js';
import { UploadsModule } from './uploads/uploads.module.js';

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic modules are configured through a static forRoot
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: config.logLevel,
            genReqId: (req, res) => resolveRequestId(req, res),
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.totp',
              'req.body.udid',
              'req.body.UDID',
              'req.body.token',
              'req.body.code',
              'res.headers["set-cookie"]',
            ],
            autoLogging: { ignore: (req) => isHealthCheck(req) },
          },
        }),
        InfraModule.forRoot(config),
        AuditModule,
        RateLimitModule,
        AuthModule,
        EnrollmentModule,
        ProfileModule,
        StorageModule,
        UploadsModule,
        CatalogModule,
        AdminCatalogModule,
        JobsModule,
      ],
      controllers: [HealthController],
      providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }, HealthService],
    };
  }
}
