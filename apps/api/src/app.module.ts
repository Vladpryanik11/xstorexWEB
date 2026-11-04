import { type DynamicModule, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Redis } from 'ioredis';
import { LoggerModule } from 'nestjs-pino';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { resolveRequestId } from './common/request-id.js';
import type { AppConfig } from './config/config.js';
import { APP_CONFIG } from './config/tokens.js';
import { HealthController } from './health/health.controller.js';
import { HealthService } from './health/health.service.js';
import { PrismaService } from './infra/prisma.service.js';
import { REDIS, redisProvider } from './infra/redis.provider.js';

@Module({})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: config.logLevel,
            genReqId: (req, res) => resolveRequestId(req, res),
            redact: ['req.headers.authorization', 'req.headers.cookie'],
          },
        }),
      ],
      controllers: [HealthController],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        PrismaService,
        redisProvider,
        HealthService,
      ],
    };
  }

  onApplicationShutdown(): void {
    this.redis.disconnect();
  }
}
