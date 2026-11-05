import type { HttpReq } from './http.js';

/** Who performs an audited mutation. */
export type Actor = { userId: string; ip?: string };

/** The signed-in staff member behind a `@Roles(...)` route. */
export function actor(req: HttpReq): Actor {
  // biome-ignore lint/style/noNonNullAssertion: @Roles guarantees a session
  return { userId: req.auth!.userId, ip: req.ip };
}
