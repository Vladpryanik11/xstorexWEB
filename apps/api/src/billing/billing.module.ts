import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MailModule } from '../mail/mail.module.js';
import { AccessController } from './access.controller.js';
import { CheckoutController } from './checkout.controller.js';
import { CheckoutService } from './checkout.service.js';
import { paymentProvider } from './provider.provider.js';
import { WebhooksController } from './webhooks.controller.js';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [CheckoutController, WebhooksController, AccessController],
  providers: [CheckoutService, paymentProvider],
  exports: [CheckoutService],
})
export class BillingModule {}
