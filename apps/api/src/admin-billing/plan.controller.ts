import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { type AdminPlan, type UpdatePlan, updatePlanSchema } from '@xstore/shared';
import { Roles } from '../auth/roles.decorator.js';
import { actor } from '../common/actor.js';
import type { HttpReq } from '../common/http.js';
import { zodBody } from '../common/zod-body.js';
import { AdminBillingService } from './admin-billing.service.js';

@Controller('admin/billing/plan')
@Roles('admin')
export class PlanController {
  constructor(private readonly billing: AdminBillingService) {}

  @Get()
  get(): Promise<AdminPlan> {
    return this.billing.plan();
  }

  @Patch()
  update(
    @Body(zodBody(updatePlanSchema)) body: UpdatePlan,
    @Req() req: HttpReq,
  ): Promise<AdminPlan> {
    return this.billing.updatePlan(body, actor(req));
  }
}
