import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { type MeResponse, type StaffLogin, staffLoginSchema } from '@xstore/shared';
import { AuditService } from '../audit/audit.service.js';
import { type HttpReq, type HttpRes, header } from '../common/http.js';
import { zodBody } from '../common/zod-body.js';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';
import { PrismaService } from '../infra/prisma.service.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { RequireAuth } from './roles.decorator.js';
import { SessionService } from './session.service.js';
import { clearedSessionCookie, sessionCookie } from './session-cookie.js';
import { StaffAuthService } from './staff-auth.service.js';

@Controller('auth')
export class AuthController {
  private readonly secureCookie: boolean;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly staffAuth: StaffAuthService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    this.secureCookie = config.siteUrl.startsWith('https:');
  }

  @Post('staff/login')
  @HttpCode(204)
  @RateLimit({ name: 'staff-login', limit: 5, windowSec: 900, by: 'ip' })
  async staffLogin(
    @Body(zodBody(staffLoginSchema)) body: StaffLogin,
    @Req() req: HttpReq,
    @Res({ passthrough: true }) res: HttpRes,
  ): Promise<void> {
    const { token, expiresAt } = await this.staffAuth.login(body, {
      ip: req.ip,
      userAgent: header(req, 'user-agent'),
    });
    res.setHeader('Set-Cookie', sessionCookie(token, expiresAt, this.secureCookie));
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: HttpReq, @Res({ passthrough: true }) res: HttpRes): Promise<void> {
    const auth = req.auth;
    if (auth) {
      await this.sessions.revoke(auth.sessionId);
      await this.audit.record({
        actorId: auth.userId,
        action: 'auth.logout',
        entity: 'User',
        entityId: auth.userId,
        ip: req.ip,
      });
    }
    res.setHeader('Set-Cookie', clearedSessionCookie(this.secureCookie));
  }

  @Get('me')
  @RequireAuth()
  async me(@Req() req: HttpReq): Promise<MeResponse> {
    // biome-ignore lint/style/noNonNullAssertion: @RequireAuth guarantees a session
    const auth = req.auth!;
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: auth.userId },
      select: { id: true, email: true, role: true },
    });
    return { user, session: { kind: auth.kind, deviceId: auth.deviceId ?? null } };
  }
}
