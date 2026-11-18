import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import {
  type AdminOrder,
  type AdminSubscription,
  adminOrdersQuerySchema,
  adminSubscriptionsQuerySchema,
  type Page,
  type RefundRequest,
  refundRequestSchema,
} from '@xstore/shared';
import { Roles } from '../auth/roles.decorator.js';
import { actor } from '../common/actor.js';
import type { HttpReq } from '../common/http.js';
import { zodBody } from '../common/zod-body.js';
import { AdminBillingService } from './admin-billing.service.js';

@Controller('admin/billing')
@Roles('admin')
export class OrdersController {
  constructor(private readonly billing: AdminBillingService) {}

  @Get('orders')
  orders(@Query() query: unknown): Promise<Page<AdminOrder>> {
    return this.billing.orders(adminOrdersQuerySchema.parse(query));
  }

  @Get('subscriptions')
  subscriptions(@Query() query: unknown): Promise<Page<AdminSubscription>> {
    return this.billing.subscriptions(adminSubscriptionsQuerySchema.parse(query));
  }

  /** Records a refund made in the provider's dashboard; moves no money. */
  @Post('orders/:id/refund')
  refund(
    @Param('id') id: string,
    @Body(zodBody(refundRequestSchema)) body: RefundRequest,
    @Req() req: HttpReq,
  ): Promise<AdminOrder> {
    return this.billing.refund(id, body.note, actor(req));
  }
}
