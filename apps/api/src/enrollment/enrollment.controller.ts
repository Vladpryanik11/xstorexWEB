import { Controller, Get, Logger, Post, Query, Req, Res } from '@nestjs/common';
import { ErrorCode } from '@xstore/shared';
import { DomainError } from '../common/domain-error.js';
import type { HttpReq } from '../common/http.js';
import { RateLimiter } from '../rate-limit/rate-limiter.js';
import { type EnrollmentResult, EnrollmentService } from './enrollment.service.js';

type FileRes = {
  setHeader(name: string, value: string): unknown;
  status(code: number): { send(body: Buffer): unknown };
  redirect(status: number, url: string): unknown;
};

/** Codes the profile link can end with; each has a text in `errorMessages`. */
export type ProfileRefusal =
  | 'FORBIDDEN'
  | 'NO_ACCESS'
  | 'DEVICE_LIMIT'
  | 'RATE_LIMITED'
  | 'ENROLLMENT_UNAVAILABLE'
  | 'ENROLLMENT_FAILED';

const PROFILE_REFUSALS: readonly string[] = [
  'FORBIDDEN',
  'NO_ACCESS',
  'DEVICE_LIMIT',
  'RATE_LIMITED',
  'ENROLLMENT_UNAVAILABLE',
] satisfies ProfileRefusal[];
const PROFILE_LIMIT = { limit: 10, windowSec: 10 * 60 };
type RedirectRes = { redirect(status: number, url: string): unknown };

/** Error class and code only, safe to log. */
function errorShape(err: unknown): { errClass: string; code?: string } {
  const errClass = err instanceof Error ? err.constructor.name : typeof err;
  const code =
    typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string'
      ? err.code
      : undefined;
  return code ? { errClass, code } : { errClass };
}

export const ENROLLMENT_CALLBACK_PATH = '/api/v1/enrollment/callback';

/** The wizard page iOS returns to after the callback, with the result in `?r=`. */
export function enrollmentResultUrl(
  siteUrl: string,
  result: EnrollmentResult | ProfileRefusal,
): string {
  const url = new URL('/get/iphone', siteUrl);
  url.searchParams.set('r', result);
  return url.toString();
}

@Controller('enrollment')
export class EnrollmentController {
  private readonly logger = new Logger(EnrollmentController.name);

  constructor(
    private readonly enrollment: EnrollmentService,
    private readonly limiter: RateLimiter,
  ) {}

  /**
   * The signed connection file Safari hands to Settings. Opened by tapping a link, so every
   * refusal is a 302 to a page: no session → sign-in, otherwise `/get/iphone?r=<code>`. Auth and
   * the limit (10 per 10 minutes per buyer) are checked here rather than by guards for that reason.
   */
  @Get('profile')
  async profile(@Req() req: HttpReq, @Res() res: FileRes): Promise<void> {
    const auth = req.auth;
    if (!auth) {
      res.redirect(302, new URL('/signin?next=/get/iphone', this.enrollment.site).toString());
      return;
    }
    let body: Buffer;
    try {
      if (auth.role !== 'user' || auth.kind !== 'user') {
        throw new DomainError(ErrorCode.FORBIDDEN, 403);
      }
      const { allowed } = await this.limiter.consume(
        `enroll-profile:user:${auth.userId}`,
        PROFILE_LIMIT.limit,
        PROFILE_LIMIT.windowSec,
      );
      if (!allowed) throw new DomainError(ErrorCode.RATE_LIMITED, 429);
      body = await this.enrollment.profile(auth.userId, auth.sessionId);
    } catch (err) {
      const code =
        err instanceof DomainError && PROFILE_REFUSALS.includes(err.code)
          ? (err.code as ProfileRefusal)
          : 'ENROLLMENT_FAILED';
      if (code === 'ENROLLMENT_FAILED') {
        this.logger.error(errorShape(err), 'enrollment profile failed');
      }
      res.redirect(302, enrollmentResultUrl(this.enrollment.site, code));
      return;
    }
    res.setHeader('Content-Type', 'application/x-apple-aspen-config');
    res.setHeader('Content-Disposition', 'attachment; filename="xstore-connect.mobileconfig"');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(body);
  }

  /**
   * Posted by iOS (no Origin check, raw body ≤ 64 KB, see `createApp`). Always answers 301 to
   * the wizard, which shows the result.
   */
  @Post('callback')
  async callback(
    @Query('s') nonce: unknown,
    @Req() req: HttpReq & { body?: unknown },
    @Res() res: RedirectRes,
  ): Promise<void> {
    let result: EnrollmentResult;
    try {
      result = await this.enrollment.callback(
        typeof nonce === 'string' ? nonce : undefined,
        req.body,
      );
    } catch (err) {
      // Never the message: a database error may quote the UDID.
      this.logger.error(errorShape(err), 'enrollment callback failed');
      result = 'ENROLLMENT_FAILED';
    }
    res.redirect(301, enrollmentResultUrl(this.enrollment.site, result));
  }
}
