import { Body, Controller, Post, Req } from '@nestjs/common';
import { type GrantRequest, type GrantResult, grantRequestSchema } from '@xstore/shared';
import { Roles } from '../auth/roles.decorator.js';
import { actor } from '../common/actor.js';
import type { HttpReq } from '../common/http.js';
import { zodBody } from '../common/zod-body.js';
import { AdminBillingService } from './admin-billing.service.js';

@Controller('admin/billing/grants')
@Roles('admin')
export class GrantsController {
  constructor(private readonly billing: AdminBillingService) {}

  @Post()
  grant(
    @Body(zodBody(grantRequestSchema)) body: GrantRequest,
    @Req() req: HttpReq,
  ): Promise<GrantResult> {
    return this.billing.grant(body, actor(req));
  }
}
