import { Inject, Injectable } from '@nestjs/common';
import type { Health } from '@xstore/shared';
import { Redis } from 'ioredis';
import { PrismaService } from '../infra/prisma.service.js';
import { REDIS } from '../infra/redis.provider.js';

const CHECK_TIMEOUT_MS = 1000;

async function probe(run: () => Promise<unknown>): Promise<'up' | 'down'> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS);
      }),
    ]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async check(): Promise<Health> {
    const [db, redis] = await Promise.all([
      probe(() => this.prisma.client.$queryRaw`SELECT 1`),
      probe(async () => {
        if (this.redis.status === 'wait' || this.redis.status === 'end') await this.redis.connect();
        await this.redis.ping();
      }),
    ]);
    return { status: db === 'up' && redis === 'up' ? 'ok' : 'degraded', checks: { db, redis } };
  }
}
