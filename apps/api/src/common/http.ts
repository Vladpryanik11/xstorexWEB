import type { Role, SessionKind } from '@xstore/db';

export type AuthContext = {
  userId: string;
  role: Role;
  sessionId: string;
  kind: SessionKind;
  deviceId?: string | null;
  expiresAt?: Date;
  renewed?: boolean;
};

/** The parts of the Express request and response this API relies on. */
export type HttpReq = {
  method: string;
  originalUrl: string;
  ip?: string;
  secure?: boolean;
  headers: Record<string, string | string[] | undefined>;
  auth?: AuthContext | null;
};

export type HttpRes = {
  setHeader(name: string, value: string | string[]): unknown;
  status(code: number): unknown;
};

export function header(req: HttpReq, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
