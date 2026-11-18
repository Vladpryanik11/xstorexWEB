import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminBillingService } from './admin-billing.service.js';
import { GrantsController } from './grants.controller.js';
import { OrdersController } from './orders.controller.js';
import { PlanController } from './plan.controller.js';

/** `/admin/billing/*`: admin only; every mutation is audited in its own transaction. */
@Module({
  imports: [AuthModule],
  controllers: [PlanController, OrdersController, GrantsController],
  providers: [AdminBillingService],
})
export class AdminBillingModule {}
