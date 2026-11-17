import { describe, expect, it } from 'vitest';
import { safeNext } from './navigation.js';

describe('safeNext', () => {
  it('keeps an internal path with query and fragment', () => {
    expect(safeNext('/app/telegram?x=1#top')).toBe('/app/telegram?x=1#top');
  });

  it.each([
    ['//evil.example'],
    ['https://evil.example'],
    ['/\\evil.example'],
    ['/a\u0000b'],
    ['/a\u001fb'],
    ['/a\u007fb'],
    ['/a\nb'],
  ])('rejects %j', (raw) => {
    expect(safeNext(raw, '/devices')).toBe('/devices');
  });
});
