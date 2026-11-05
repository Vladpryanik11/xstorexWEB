import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@xstore/shared';
import { DomainError } from '../common/domain-error.js';
import type { HttpReq, HttpRes } from '../common/http.js';
import { RATE_LIMIT_KEY, type RateLimitOptions } from './rate-limit.decorator.js';
import { RateLimiter } from './rate-limiter.js';

/** Runs after AuthGuard, so `by: 'user'` can key on the signed-in user. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!options) return true;
    const req = ctx.switchToHttp().getRequest<HttpReq>();
    const subject = options.by === 'user' ? req.auth?.userId : undefined;
    const key = subject
      ? `${options.name}:user:${subject}`
      : `${options.name}:ip:${req.ip ?? 'unknown'}`;
    const { allowed, retryAfterSec } = await this.limiter.consume(
      key,
      options.limit,
      options.windowSec,
    );
    if (allowed) return true;
    ctx.switchToHttp().getResponse<HttpRes>().setHeader('Retry-After', String(retryAfterSec));
    throw new DomainError(ErrorCode.RATE_LIMITED, 429);
  }
}
