import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req, Res } from '@nestjs/common';
import {
  type CheckoutRequest,
  type CheckoutResponse,
  checkoutRequestSchema,
  type OrderView,
  type PlanView,
} from '@xstore/shared';
import { sessionCookie } from '../auth/session-cookie.js';
import { type HttpReq, type HttpRes, header } from '../common/http.js';
import { zodBody } from '../common/zod-body.js';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { CheckoutService } from './checkout.service.js';

@Controller('billing')
export class CheckoutController {
  private readonly secureCookie: boolean;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly checkout: CheckoutService,
  ) {
    this.secureCookie = config.siteUrl.startsWith('https:');
  }

  @Get('plan')
  plan(): Promise<PlanView> {
    return this.checkout.plan();
  }

  @Post('checkout')
  @HttpCode(200)
  @RateLimit({ name: 'checkout', limit: 10, windowSec: 600, by: 'ip' })
  async create(
    @Body(zodBody(checkoutRequestSchema)) body: CheckoutRequest,
    @Req() req: HttpReq,
    @Res({ passthrough: true }) res: HttpRes,
  ): Promise<CheckoutResponse> {
    const { order, guestUserId } = await this.checkout.openOrder(body, req.auth);
    if (guestUserId) {
      // The cookie goes out even if the provider then fails: a retry with the same key and
      // this session continues the same order.
      const session = await this.checkout.createGuestSession(guestUserId, {
        ip: req.ip,
        userAgent: header(req, 'user-agent'),
      });
      res.setHeader(
        'Set-Cookie',
        sessionCookie(session.token, session.expiresAt, this.secureCookie || req.secure === true),
      );
    }
    const redirectUrl = await this.checkout.paymentRedirect(order);
    return { orderId: order.id, redirectUrl };
  }

  @Get('orders/:id')
  order(@Param('id') id: string, @Req() req: HttpReq): Promise<OrderView> {
    return this.checkout.orderView(id, req.auth);
  }
}
