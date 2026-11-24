import { Body, Controller, Get, Header, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { type ChosenApp, ErrorCode, type InstallJobView, type InstallLink } from '@xstore/shared';
import { z } from 'zod';
import { RequireUser } from '../auth/roles.decorator.js';
import { DomainError } from '../common/domain-error.js';
import { type HttpReq, header } from '../common/http.js';
import { zodBody } from '../common/zod-body.js';
import { RateLimiter } from '../rate-limit/rate-limiter.js';
import { InstallService } from './install.service.js';

/**
 * `confirmReplace` came from the «заменит» question, gone since 2026-11-24 (apps keep their bundle
 * id); a page loaded before the update may still send it.
 */
const requestSchema = z
  .object({ confirmReplace: z.boolean().optional() })
  .strict()
  .optional()
  .transform((v) => v ?? {});
/** Taps per buyer: generous for retries, but a loop cannot keep the signer busy. */
const INSTALL_LIMIT = { limit: 30, windowSec: 10 * 60 };

type PlistRes = { setHeader(name: string, value: string): unknown };

@Controller('install')
export class InstallController {
  constructor(
    private readonly install: InstallService,
    private readonly limiter: RateLimiter,
  ) {}

  @Post('apps/:slug')
  @RequireUser()
  @HttpCode(200)
  async request(
    @Param('slug') slug: string,
    @Body(zodBody(requestSchema)) _body: z.infer<typeof requestSchema>,
    @Req() req: HttpReq,
  ): Promise<InstallJobView> {
    // biome-ignore lint/style/noNonNullAssertion: @RequireUser guarantees a session
    const userId = req.auth!.userId;
    const { allowed } = await this.limiter.consume(
      `install:${userId}`,
      INSTALL_LIMIT.limit,
      INSTALL_LIMIT.windowSec,
    );
    if (!allowed) throw new DomainError(ErrorCode.RATE_LIMITED, 429);
    return this.install.request(userId, slug);
  }

  @Get('chosen')
  @RequireUser()
  chosen(@Req() req: HttpReq): Promise<ChosenApp> {
    // biome-ignore lint/style/noNonNullAssertion: @RequireUser guarantees a session
    return this.install.chosen(req.auth!.userId);
  }

  @Get('jobs/:id')
  @RequireUser()
  job(@Param('id') id: string, @Req() req: HttpReq): Promise<InstallJobView> {
    // biome-ignore lint/style/noNonNullAssertion: @RequireUser guarantees a session
    return this.install.job(req.auth!.userId, id);
  }

  @Post('jobs/:id/token')
  @RequireUser()
  @HttpCode(200)
  async token(@Param('id') id: string, @Req() req: HttpReq): Promise<InstallLink> {
    // biome-ignore lint/style/noNonNullAssertion: @RequireUser guarantees a session
    const userId = req.auth!.userId;
    // Each link keeps the copy for an hour: a loop must not pin the cache.
    const { allowed } = await this.limiter.consume(
      `install-link:${userId}`,
      INSTALL_LIMIT.limit,
      INSTALL_LIMIT.windowSec,
    );
    if (!allowed) throw new DomainError(ErrorCode.RATE_LIMITED, 429);
    return this.install.token(userId, id);
  }

  /** Public: iOS fetches it without cookies. The token in the path is the only key. */
  @Get(':token/manifest.plist')
  @Header('Cache-Control', 'no-store')
  async manifest(
    @Param('token') token: string,
    @Req() req: HttpReq,
    @Res({ passthrough: true }) res: PlistRes,
  ): Promise<string> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new DomainError(ErrorCode.INSTALL_LINK_EXPIRED, 410);
    const xml = await this.install.manifest(token, {
      ip: req.ip ?? null,
      ua: header(req, 'user-agent') ?? null,
    });
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return xml;
  }
}
