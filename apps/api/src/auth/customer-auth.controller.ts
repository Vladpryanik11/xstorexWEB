import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import {
  type CustomerLogin,
  customerLoginSchema,
  type EmailCodeRequest,
  type EmailCodeVerify,
  ErrorCode,
  emailCodeRequestSchema,
  emailCodeVerifySchema,
  type SetPassword,
  setPasswordSchema,
} from '@xstore/shared';
import { DomainError } from '../common/domain-error.js';
import { type HttpReq, type HttpRes, header } from '../common/http.js';
import { zodBody } from '../common/zod-body.js';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { RateLimiter } from '../rate-limit/rate-limiter.js';
import { CustomerAuthService } from './customer-auth.service.js';
import { RequireUser } from './roles.decorator.js';
import { SessionService } from './session.service.js';
import { sessionCookie } from './session-cookie.js';

/** Buyer sign-in: password, code to the email, and the password set after payment. */
@Controller('auth')
export class CustomerAuthController {
  private readonly secureCookie: boolean;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly auth: CustomerAuthService,
    private readonly sessions: SessionService,
    private readonly limiter: RateLimiter,
  ) {
    this.secureCookie = config.siteUrl.startsWith('https:');
  }

  @Post('password')
  @HttpCode(204)
  @RequireUser()
  @RateLimit({ name: 'buyer-password', limit: 10, windowSec: 15 * 60, by: 'user' })
  async setPassword(
    @Body(zodBody(setPasswordSchema)) body: SetPassword,
    @Req() req: HttpReq,
  ): Promise<void> {
    // biome-ignore lint/style/noNonNullAssertion: @RequireUser guarantees a session
    const auth = req.auth!;
    await this.auth.setPassword(auth.userId, body.password, auth.sessionId);
  }

  /**
   * Two limits: 5 per IP (guard) and 10 per email from any IP (here, after the body is parsed).
   * Both answer the same 429 whether or not the email has an account.
   */
  @Post('login')
  @HttpCode(204)
  @RateLimit({ name: 'buyer-login', limit: 5, windowSec: 15 * 60, by: 'ip' })
  async login(
    @Body(zodBody(customerLoginSchema)) body: CustomerLogin,
    @Req() req: HttpReq,
    @Res({ passthrough: true }) res: HttpRes,
  ): Promise<void> {
    // `body.email` is already normalized by the schema (trimmed, lower case).
    const perEmail = await this.limiter.consume(
      `buyer-login:email:${body.email}`,
      LOGIN_PER_EMAIL.limit,
      LOGIN_PER_EMAIL.windowSec,
    );
    if (!perEmail.allowed) {
      res.setHeader('Retry-After', String(perEmail.retryAfterSec));
      throw new DomainError(ErrorCode.RATE_LIMITED, 429);
    }
    const session = await this.auth.login(body, meta(req));
    await this.replaceSession(req, res, session);
  }

  @Post('code/request')
  @HttpCode(204)
  @RateLimit({ name: 'code-request', limit: 10, windowSec: 10 * 60, by: 'ip' })
  async requestCode(
    @Body(zodBody(emailCodeRequestSchema)) body: EmailCodeRequest,
    @Res({ passthrough: true }) res: HttpRes,
  ): Promise<void> {
    const wait = await this.auth.requestCode(body.email);
    if (wait) {
      res.setHeader('Retry-After', String(wait.retryAfterSec));
      throw new DomainError(ErrorCode.RATE_LIMITED, 429);
    }
  }

  /** Not in Global Constraints: a guard against spraying codes over many emails from one IP. */
  @Post('code/verify')
  @HttpCode(204)
  @RateLimit({ name: 'code-verify', limit: 30, windowSec: 10 * 60, by: 'ip' })
  async verifyCode(
    @Body(zodBody(emailCodeVerifySchema)) body: EmailCodeVerify,
    @Req() req: HttpReq,
    @Res({ passthrough: true }) res: HttpRes,
  ): Promise<void> {
    const session = await this.auth.verifyCode(body, meta(req));
    await this.replaceSession(req, res, session);
  }

  /** Signs out the buyer session this browser had, then sets the new one. */
  private async replaceSession(
    req: HttpReq,
    res: HttpRes,
    session: { token: string; expiresAt: Date },
  ): Promise<void> {
    if (req.auth?.kind === 'user') await this.sessions.revoke(req.auth.sessionId);
    res.setHeader('Set-Cookie', sessionCookie(session.token, session.expiresAt, this.secureCookie));
  }
}

const LOGIN_PER_EMAIL = { limit: 10, windowSec: 15 * 60 };

const meta = (req: HttpReq) => ({ ip: req.ip, userAgent: header(req, 'user-agent') });
