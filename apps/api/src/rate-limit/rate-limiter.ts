import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS, redisReady } from '../infra/redis.provider.js';

export type RateLimitResult = { allowed: boolean; retryAfterSec: number };

/** Fixed window counter: INCR, then EXPIRE … NX so the first hit starts the window. */
@Injectable()
export class RateLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async consume(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
    const redis = await redisReady(this.redis);
    const k = `rl:${key}`;
    const replies = await redis.multi().incr(k).expire(k, windowSec, 'NX').ttl(k).exec();
    if (!replies) throw new Error('Rate limit transaction aborted');
    for (const [err] of replies) if (err) throw err;
    const count = Number(replies[0]?.[1]);
    const ttl = Number(replies[2]?.[1]);
    if (count <= limit) return { allowed: true, retryAfterSec: 0 };
    return { allowed: false, retryAfterSec: ttl > 0 ? ttl : windowSec };
  }
}
