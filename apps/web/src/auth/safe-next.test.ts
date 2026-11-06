import { expect, it } from 'vitest';
import { safeAdminNext } from './safe-next';

it('keeps internal admin paths and rejects external or login redirects', () => {
  expect(safeAdminNext('/admin/apps?status=draft')).toBe('/admin/apps?status=draft');
  for (const value of [
    'https://evil.test',
    '//evil.test',
    '/admin/../evil',
    '/admin/login',
    '/admin\\evil',
    '/administrator',
    '/admin/%2e%2e/evil',
    '/admin/apps\n',
  ]) {
    expect(safeAdminNext(value)).toBe('/admin/apps');
  }
});
