import {
  type DynamicModule,
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';
import { PrismaService } from './prisma.service.js';
import { REDIS, redisProvider } from './redis.provider.js';

/** Config, Prisma and Redis for every feature module. */
@Global()
@Module({})
export class InfraModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: InfraModule,
      providers: [{ provide: APP_CONFIG, useValue: config }, PrismaService, redisProvider],
      exports: [APP_CONFIG, PrismaService, REDIS],
    };
  }

  onApplicationShutdown(): void {
    this.redis.disconnect();
  }
}
