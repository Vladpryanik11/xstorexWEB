import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { ErrorCode } from '@xstore/shared';
import { DomainError } from '../common/domain-error.js';
import { type HttpReq, header } from '../common/http.js';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Called by Apple and payment providers, never by a browser on our site (M2, M5). */
const EXEMPT = ['/api/v1/enrollment/callback', '/api/v1/billing/webhooks/'];

export function originAllowed(
  method: string,
  path: string,
  origin: string | undefined,
  site: string,
): boolean {
  if (!UNSAFE.has(method.toUpperCase())) return true;
  if (EXEMPT.some((prefix) => path.startsWith(prefix))) return true;
  return origin === site;
}

/** CSRF defence for cookie sessions: mutations must come from our own origin. */
@Injectable()
export class OriginMiddleware implements NestMiddleware {
  private readonly site: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.site = new URL(config.siteUrl).origin;
  }

  use(req: HttpReq, _res: unknown, next: (err?: unknown) => void): void {
    if (originAllowed(req.method, req.originalUrl, header(req, 'origin'), this.site)) next();
    else next(new DomainError(ErrorCode.FORBIDDEN, 403));
  }
}
