import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@xstore/db';
import { ErrorCode } from '@xstore/shared';
import { DomainError } from '../common/domain-error.js';
import { type AuthContext, type HttpReq, type HttpRes, header } from '../common/http.js';
import { REQUIRE_AUTH_KEY, REQUIRE_USER_KEY, ROLES_KEY } from './roles.decorator.js';
import { SessionService } from './session.service.js';
import { readCookie, SESSION_COOKIE, sessionCookie } from './session-cookie.js';

/** Decides access for a resolved session against `@RequireAuth()`, `@RequireUser()` and `@Roles()`. */
export function checkAccess(
  auth: AuthContext | null,
  requireAuth: boolean,
  roles: Role[] | undefined,
  requireUser = false,
): void {
  if (!requireAuth && !requireUser && !roles) return;
  if (!auth) throw new DomainError(ErrorCode.UNAUTHORIZED, 401);
  if (requireUser && (auth.role !== 'user' || auth.kind !== 'user'))
    throw new DomainError(ErrorCode.FORBIDDEN, 403);
  if (!roles) return;
  if (!roles.includes(auth.role)) throw new DomainError(ErrorCode.FORBIDDEN, 403);
  if (auth.role !== 'user' && auth.kind !== 'staff')
    throw new DomainError(ErrorCode.FORBIDDEN, 403);
}

/** Global: resolves the session cookie into `req.auth`, then enforces route metadata. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<HttpReq>();
    const res = ctx.switchToHttp().getResponse<HttpRes>();
    const token = readCookie(header(req, 'cookie'), SESSION_COOKIE);
    req.auth = token ? await this.sessions.resolve(token) : null;
    if (token && req.auth?.renewed && req.auth.expiresAt) {
      res.setHeader('Set-Cookie', sessionCookie(token, req.auth.expiresAt, req.secure === true));
    }
    const targets = [ctx.getHandler(), ctx.getClass()];
    const requireAuth = this.reflector.getAllAndOverride<boolean | undefined>(
      REQUIRE_AUTH_KEY,
      targets,
    );
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    const requireUser = this.reflector.getAllAndOverride<boolean | undefined>(
      REQUIRE_USER_KEY,
      targets,
    );
    checkAccess(req.auth, requireAuth === true, roles, requireUser === true);
    return true;
  }
}
