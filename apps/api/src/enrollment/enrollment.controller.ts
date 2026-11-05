import { randomBytes, randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ErrorCode } from '@xstore/shared';
import { z } from 'zod';
import { sessionCookie } from '../auth/session-cookie.js';
import { DomainError } from '../common/domain-error.js';
import { type HttpReq, type HttpRes, header } from '../common/http.js';
import { zodBody } from '../common/zod-body.js';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';
import { PrismaService } from '../infra/prisma.service.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { signCms } from './cms.js';
import { EnrollService } from './enroll.service.js';
import { buildEnrollmentProfile } from './profile-builder.js';
import { loadSigningIdentity } from './signing-identity.js';

const profileQuery = z.object({
  next: z.string().max(2048).optional(),
  link: z.literal('1').optional(),
});

@Controller('enrollment')
export class EnrollmentController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly enroll: EnrollService,
  ) {}

  @Get('profile')
  @RateLimit({ name: 'enroll-profile', limit: 10, windowSec: 600, by: 'ip' })
  async profile(
    @Query() raw: unknown,
    @Req() req: HttpReq,
    @Res({ passthrough: true }) res: HttpRes,
  ): Promise<StreamableFile> {
    const query = profileQuery.parse(raw);
    if (query.link && !req.auth) throw new DomainError(ErrorCode.UNAUTHORIZED, 401);
    if (query.link && req.auth?.kind !== 'user') throw new DomainError(ErrorCode.FORBIDDEN, 403);
    const nonce = randomBytes(32).toString('base64url');
    const next =
      query.next?.startsWith('/') &&
      !/^\/[/\\]/.test(query.next) &&
      !Array.from(query.next).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
        ? query.next
        : null;
    const identity = await loadSigningIdentity(
      this.config.enrollment.certPath,
      this.config.enrollment.keyPath,
    );
    const profile = await signCms(
      Buffer.from(
        buildEnrollmentProfile({ nonce, siteUrl: this.config.siteUrl, payloadUuid: randomUUID() }),
      ),
      identity,
    );
    await this.prisma.client.enrollmentSession.create({
      data: {
        nonce,
        userId: query.link ? req.auth?.userId : null,
        next,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });
    res.setHeader('Content-Type', 'application/x-apple-aspen-config');
    res.setHeader('Content-Disposition', 'attachment; filename="xstore-signin.mobileconfig"');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    return new StreamableFile(profile);
  }

  @Post('callback')
  @HttpCode(301)
  @RateLimit({ name: 'enroll-callback', limit: 20, windowSec: 600, by: 'ip' })
  async callback(
    @Query('s') nonce: unknown,
    @Body() raw: unknown,
    @Res({ passthrough: true }) res: HttpRes,
  ): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Location', await this.enroll.callback(nonce, raw));
  }

  @Post('complete')
  async complete(
    @Body(zodBody(z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }))) body: {
      token: string;
    },
    @Req() req: HttpReq,
    @Res({ passthrough: true }) res: HttpRes,
  ): Promise<{ next: string }> {
    const session = await this.enroll.complete(body.token, {
      ip: req.ip,
      userAgent: header(req, 'user-agent'),
    });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Set-Cookie',
      sessionCookie(session.token, session.expiresAt, this.config.siteUrl.startsWith('https:')),
    );
    return { next: session.next };
  }
}
