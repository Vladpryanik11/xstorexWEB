import { expect, it } from 'vitest';
import type { AuthContext } from '../common/http.js';
import { checkAccess } from './auth.guard.js';

const ctx = (role: AuthContext['role'], kind: AuthContext['kind']): AuthContext => ({
  userId: 'u',
  role,
  kind,
  sessionId: 's',
});
const status = (fn: () => void): number | undefined => {
  try {
    fn();
    return undefined;
  } catch (err) {
    return (err as { status: number }).status;
  }
};

it('lets anyone through public routes', () => {
  expect(status(() => checkAccess(null, false, undefined))).toBeUndefined();
});

it('requires a session for @RequireAuth and @Roles', () => {
  expect(status(() => checkAccess(null, true, undefined))).toBe(401);
  expect(status(() => checkAccess(null, false, ['admin']))).toBe(401);
});

it('checks the role', () => {
  expect(status(() => checkAccess(ctx('admin', 'staff'), false, ['admin']))).toBeUndefined();
  expect(status(() => checkAccess(ctx('support', 'staff'), false, ['admin']))).toBe(403);
  expect(status(() => checkAccess(ctx('user', 'user'), false, ['admin', 'support']))).toBe(403);
});

it('requires a staff session for staff roles', () => {
  expect(status(() => checkAccess(ctx('admin', 'user'), false, ['admin']))).toBe(403);
});

it('restricts user-only routes to user sessions', () => {
  expect(status(() => checkAccess(null, false, undefined, true))).toBe(401);
  expect(status(() => checkAccess(ctx('user', 'user'), false, undefined, true))).toBeUndefined();
  expect(status(() => checkAccess(ctx('admin', 'staff'), false, undefined, true))).toBe(403);
  expect(status(() => checkAccess(ctx('user', 'staff'), false, undefined, true))).toBe(403);
});
