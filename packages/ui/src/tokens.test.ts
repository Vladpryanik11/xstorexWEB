import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'tokens.css'), 'utf8');

function token(name: string): string | undefined {
  const m = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  return m?.[1]?.trim().toLowerCase();
}

describe('palette E tokens (spec 2026-11-17, §3–4)', () => {
  it.each([
    ['--x-white', '#fff'],
    ['--x-ice', '#f2f8fd'],
    ['--x-sky-50', '#e3edfd'],
    ['--x-sky-200', '#a8cff4'],
    ['--x-sky-400', '#4da3ff'],
    ['--x-blue', '#1a6eea'],
    ['--x-blue-deep', '#0a4bbf'],
    ['--x-text', '#0e1a33'],
    ['--x-text-2', '#5f6b85'],
    ['--x-quiet-fg', '#0f5fd6'],
    ['--x-ok', '#0f7743'],
    ['--x-ok-bg', '#e3f5ea'],
    ['--x-warn', '#a35a00'],
    ['--x-warn-bg', '#fdf0dc'],
    ['--x-err', '#c62f35'],
    ['--x-err-bg', '#fde6e7'],
    ['--x-shadow', '0 12px 32px -20px rgba(26, 110, 234, .45)'],
    ['--x-shadow-sm', '0 4px 12px -4px rgba(26, 110, 234, .14)'],
    ['--x-scrim', 'rgba(14, 26, 51, .62)'],
    ['--x-hair', 'rgba(26, 110, 234, .10)'],
    ['--x-radius-panel', '1.75rem'],
    ['--x-radius-card', '1.5rem'],
    ['--x-radius-pill', '999px'],
  ])('%s = %s', (name, value) => {
    expect(token(name)).toBe(value);
  });

  it('page background is ice', () => {
    expect(css).toMatch(/body\s*\{\s*background:\s*var\(--x-ice\)/);
  });
});
