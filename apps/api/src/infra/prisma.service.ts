import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient } from '@xstore/db';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';

type PrismaClient = ReturnType<typeof createPrismaClient>;

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = createPrismaClient(config.databaseUrl);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
