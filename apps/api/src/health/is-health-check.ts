/** The global prefix (app.ts) plus the HealthController route. */
const HEALTH_PATH = '/api/v1/health';

type Req = { url?: string; originalUrl?: string };

/**
 * True for the health endpoint that the compose healthcheck polls every 5 s: request logs skip it.
 * Express strips a middleware's mount path from `req.url`, so the full path is `originalUrl`.
 */
export function isHealthCheck(req: Req): boolean {
  const path = (req.originalUrl ?? req.url ?? '').split('?', 1)[0];
  return path === HEALTH_PATH;
}
