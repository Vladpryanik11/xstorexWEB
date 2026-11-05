import { SetMetadata } from '@nestjs/common';

export type RateLimitOptions = {
  name: string;
  limit: number;
  windowSec: number;
  by: 'ip' | 'user';
};

export const RATE_LIMIT_KEY = 'xstore:rate-limit';

export const RateLimit = (options: RateLimitOptions): MethodDecorator & ClassDecorator =>
  SetMetadata(RATE_LIMIT_KEY, options);
