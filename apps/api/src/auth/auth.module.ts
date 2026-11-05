import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { OriginMiddleware } from './origin.middleware.js';
import { SessionService } from './session.service.js';
import { StaffAuthService } from './staff-auth.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    SessionService,
    StaffAuthService,
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
