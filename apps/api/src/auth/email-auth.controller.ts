import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import {
  type EmailRequest,
  type EmailVerify,
  ErrorCode,
  emailRequestSchema,
  emailVerifySchema,
} from '@xstore/shared';
import { DomainError } from '../common/domain-error.js';
import { type HttpReq, type HttpRes, header } from '../common/http.js';
import { zodBody } from '../common/zod-body.js';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';
import { PrismaService } from '../infra/prisma.service.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { EmailCodeService, EmailRequestLimit } from './email-code.service.js';
import { SessionService } from './session.service.js';
import { sessionCookie } from './session-cookie.js';

@Controller('auth/email')
export class EmailAuthController {
  constructor(
    private readonly codes: EmailCodeService,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('request')
  @HttpCode(204)
  @RateLimit({ name: 'email-request', limit: 10, windowSec: 3600, by: 'ip' })
  async request(
    @Body(zodBody(emailRequestSchema)) body: EmailRequest,
    @Res({ passthrough: true }) res: HttpRes,
  ): Promise<void> {
    try {
      await this.codes.request(body.email);
    } catch (err) {
      if (err instanceof EmailRequestLimit) res.setHeader('Retry-After', String(err.retryAfterSec));
      throw err;
    }
  }

  @Post('verify')
  @HttpCode(204)
  @RateLimit({ name: 'email-verify', limit: 10, windowSec: 600, by: 'ip' })
  async verify(
    @Body(zodBody(emailVerifySchema)) body: EmailVerify,
    @Req() req: HttpReq,
    @Res({ passthrough: true }) res: HttpRes,
  ): Promise<void> {
    if (!(await this.codes.verify(body.email, body.code)))
      throw new DomainError(ErrorCode.CODE_INVALID, 400);
    const user = await this.prisma.client.user.upsert({
      where: { email: body.email },
      create: { email: body.email, role: 'user' },
      update: {},
    });
    if (user.blockedAt) throw new DomainError(ErrorCode.ACCOUNT_BLOCKED, 403);
    const session = await this.sessions.create(user.id, 'user', {
      ip: req.ip,
      userAgent: header(req, 'user-agent'),
    });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Set-Cookie',
      sessionCookie(session.token, session.expiresAt, this.config.siteUrl.startsWith('https:')),
    );
  }
}
