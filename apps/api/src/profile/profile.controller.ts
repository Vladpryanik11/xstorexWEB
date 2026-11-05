import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Prisma } from '@xstore/db';
import {
  type EmailRequest,
  type EmailVerify,
  ErrorCode,
  emailRequestSchema,
  emailVerifySchema,
} from '@xstore/shared';
import { EmailCodeService, EmailRequestLimit } from '../auth/email-code.service.js';
import { RequireAuth } from '../auth/roles.decorator.js';
import { DomainError } from '../common/domain-error.js';
import { type AuthContext, type HttpReq, type HttpRes } from '../common/http.js';
import { zodBody } from '../common/zod-body.js';
import { PrismaService } from '../infra/prisma.service.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';

export function requireUser(req: HttpReq): AuthContext {
  if (!req.auth) throw new DomainError(ErrorCode.UNAUTHORIZED, 401);
  if (req.auth.kind !== 'user') throw new DomainError(ErrorCode.FORBIDDEN, 403);
  return req.auth;
}

@Controller('profile')
@RequireAuth()
export class ProfileController {
  constructor(
    private readonly codes: EmailCodeService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('email/request')
  @HttpCode(204)
  @RateLimit({ name: 'email-request', limit: 10, windowSec: 3600, by: 'ip' })
  async requestEmail(
    @Body(zodBody(emailRequestSchema)) body: EmailRequest,
    @Req() req: HttpReq,
    @Res({ passthrough: true }) res: HttpRes,
  ): Promise<void> {
    requireUser(req);
    try {
      await this.codes.request(body.email);
    } catch (err) {
      if (err instanceof EmailRequestLimit) res.setHeader('Retry-After', String(err.retryAfterSec));
      throw err;
    }
  }

  @Post('email/verify')
  @HttpCode(204)
  @RateLimit({ name: 'email-verify', limit: 10, windowSec: 600, by: 'ip' })
  async verifyEmail(
    @Body(zodBody(emailVerifySchema)) body: EmailVerify,
    @Req() req: HttpReq,
  ): Promise<void> {
    const auth = requireUser(req);
    if (!(await this.codes.verify(body.email, body.code)))
      throw new DomainError(ErrorCode.CODE_INVALID, 400);
    const owner = await this.prisma.client.user.findUnique({ where: { email: body.email } });
    if (owner && owner.id !== auth.userId) throw new DomainError(ErrorCode.EMAIL_TAKEN, 409);
    try {
      await this.prisma.client.user.update({
        where: { id: auth.userId },
        data: { email: body.email },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        throw new DomainError(ErrorCode.EMAIL_TAKEN, 409);
      throw err;
    }
  }
}
