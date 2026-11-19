const ENROLLMENT_CALLBACK = '/api/v1/enrollment/callback';
const HIDDEN = '…';

type LoggedRequest = { url?: string; query?: Record<string, unknown> } & Record<string, unknown>;

/**
 * pino-http request serializer: the one-time enrollment nonce (`?s=`) of the profile service
 * callback never reaches the logs. Other requests are logged as they are.
 */
export function redactRequestLog<T extends LoggedRequest>(req: T): T {
  if (typeof req.url !== 'string' || !req.url.startsWith(ENROLLMENT_CALLBACK)) return req;
  const url = new URL(req.url, 'http://x');
  if (url.searchParams.has('s')) url.searchParams.set('s', HIDDEN);
  const query = req.query && 's' in req.query ? { ...req.query, s: HIDDEN } : req.query;
  return { ...req, url: `${url.pathname}${url.search}`, ...(query ? { query } : {}) };
}
