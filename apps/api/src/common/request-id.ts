import { randomUUID } from 'node:crypto';

type Req = { headers: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): unknown };

const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

export function resolveRequestId(req: Req, res: Res): string {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', id);
  return id;
}
