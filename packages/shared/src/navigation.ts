const INTERNAL_ORIGIN = 'https://xstorex.internal';
const MAX_DECODE_PASSES = 6;

function isUnsafe(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//')) return true;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return true;
  try {
    const url = new URL(value, INTERNAL_ORIGIN);
    return url.origin !== INTERNAL_ORIGIN || url.username !== '' || url.password !== '';
  } catch {
    return true;
  }
}

/** Accept only an internal absolute path, including its query and fragment. */
export function safeNext(raw: string | undefined, fallback = '/devices'): string {
  if (!raw || isUnsafe(raw)) return fallback;
  let decoded = raw;
  for (let i = 0; i < MAX_DECODE_PASSES; i += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return fallback;
    }
    if (next === decoded) break;
    decoded = next;
    if (isUnsafe(decoded)) return fallback;
  }
  if (decoded.includes('%')) return fallback;
  return raw;
}
