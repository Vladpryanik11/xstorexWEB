import { Controller, Get, Logger, Post, Query, Req, Res } from '@nestjs/common';
import { RequireUser } from '../auth/roles.decorator.js';
import type { HttpReq } from '../common/http.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { type EnrollmentResult, EnrollmentService } from './enrollment.service.js';

type FileRes = {
  setHeader(name: string, value: string): unknown;
  status(code: number): { send(body: Buffer): unknown };
};
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
export function enrollmentResultUrl(siteUrl: string, result: EnrollmentResult): string {
  const url = new URL('/get/iphone', siteUrl);
  url.searchParams.set('r', result);
  return url.toString();
}

@Controller('enrollment')
export class EnrollmentController {
  private readonly logger = new Logger(EnrollmentController.name);

  constructor(private readonly enrollment: EnrollmentService) {}

  /** The signed connection file Safari hands to Settings. */
  @Get('profile')
  @RequireUser()
  @RateLimit({ name: 'enroll-profile', limit: 10, windowSec: 10 * 60, by: 'user' })
  async profile(@Req() req: HttpReq, @Res() res: FileRes): Promise<void> {
    // biome-ignore lint/style/noNonNullAssertion: @RequireUser guarantees a session
    const auth = req.auth!;
    const body = await this.enrollment.profile(auth.userId, auth.sessionId);
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
