/** Only normalized admin paths may be used as the staff-login return target. */
export function safeAdminNext(value?: string): string {
  const fallback = '/admin/apps';
  if (!value || /[\\\s%]/.test(value)) return fallback;
  try {
    const url = new URL(value, 'https://xstore.invalid');
    if (
      url.origin !== 'https://xstore.invalid' ||
      !value.startsWith('/admin') ||
      (url.pathname !== '/admin' && !url.pathname.startsWith('/admin/')) ||
      url.pathname === '/admin/login' ||
      url.pathname !== value.split(/[?#]/)[0]
    )
      return fallback;
    return value;
  } catch {
    return fallback;
  }
}
