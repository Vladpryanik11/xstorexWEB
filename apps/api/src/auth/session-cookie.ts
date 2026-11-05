export const SESSION_COOKIE = 'xs_session';

function flags(secure: boolean): string {
  return secure ? 'HttpOnly; SameSite=Lax; Secure' : 'HttpOnly; SameSite=Lax';
}

export function sessionCookie(token: string, expiresAt: Date, secure: boolean): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return `${SESSION_COOKIE}=${token}; Path=/; Expires=${expiresAt.toUTCString()}; Max-Age=${maxAge}; ${flags(secure)}`;
}

export function clearedSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; ${flags(secure)}`;
}

/** Reads one cookie from a `Cookie` header; returns undefined when absent or empty. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1 || part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    return value === '' ? undefined : value;
  }
  return undefined;
}
