import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MailModule } from '../mail/mail.module.js';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { CustomerAuthController } from './customer-auth.controller.js';
import { CustomerAuthService } from './customer-auth.service.js';
import { EmailCodeService } from './email-code.service.js';
import { OriginMiddleware } from './origin.middleware.js';
import { SessionService } from './session.service.js';
import { StaffAuthService } from './staff-auth.service.js';

@Module({
  imports: [MailModule],
  controllers: [AuthController, CustomerAuthController],
  providers: [
    SessionService,
    StaffAuthService,
    CustomerAuthService,
    EmailCodeService,
    // Order matters: the session is resolved before rate limits keyed by user.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [SessionService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(OriginMiddleware).forRoutes('*path');
  }
}
