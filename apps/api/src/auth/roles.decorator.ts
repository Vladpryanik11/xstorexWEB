import { SetMetadata } from '@nestjs/common';
import type { Role } from '@xstore/db';

export const REQUIRE_AUTH_KEY = 'xstore:require-auth';
export const ROLES_KEY = 'xstore:roles';

/** Any signed-in user; 401 otherwise. */
export const RequireAuth = (): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_AUTH_KEY, true);

/**
 * Signed-in user with one of the roles; 401 without a session, 403 with another role.
 * Staff roles (`support`, `admin`) also require a staff session.
 */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
