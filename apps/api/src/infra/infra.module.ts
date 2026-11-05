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
import { closeQueues, QUEUES, type Queues, queuesProvider } from './queues.provider.js';
import { REDIS, redisProvider } from './redis.provider.js';

/** Config, Prisma, Redis and queue producers for every feature module. */
@Global()
@Module({})
export class InfraModule implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(QUEUES) private readonly queues: Queues,
  ) {}

  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: InfraModule,
      providers: [
        { provide: APP_CONFIG, useValue: config },
        PrismaService,
        redisProvider,
        queuesProvider,
      ],
      exports: [APP_CONFIG, PrismaService, REDIS, QUEUES],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    this.redis.disconnect();
    await closeQueues(this.queues);
  }
}
