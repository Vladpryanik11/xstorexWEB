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

  it.each([
    '--x-page',
    '--x-surface',
    '--x-surface-2',
    '--x-ink',
    '--x-quiet',
    '--x-header-gradient',
    '--x-glass',
    '--x-glass-shadow',
  ])('legacy token %s is gone', (name) => {
    expect(token(name)).toBeUndefined();
  });
});

describe('typography tokens (spec 2026-11-17-typography §2–4)', () => {
  it('Inter sets the text, Manrope the headings', () => {
    expect(token('--x-font')).toMatch(/^var\(--font-inter, inter\)/);
    expect(token('--x-font-head')).toMatch(/^var\(--font-manrope, manrope\)/);
    expect(token('--x-system')).toBeUndefined();
    expect(css).not.toMatch(/helvetica/i);
  });

  it.each([
    ['--x-type-display', '700 clamp(2.125rem, 1.6rem + 2.2vw, 3rem) / 1.08 var(--x-font-head)'],
    ['--x-type-h1', '700 1.75rem / 1.15 var(--x-font-head)'],
    ['--x-type-h2', '700 1.375rem / 1.25 var(--x-font-head)'],
    ['--x-type-h3', '600 1.0625rem / 1.3 var(--x-font)'],
    ['--x-type-body', '400 1rem / 1.5 var(--x-font)'],
    ['--x-type-ui', '500 .875rem / 1.4 var(--x-font)'],
    ['--x-type-cap', '500 .75rem / 1.35 var(--x-font)'],
    ['--x-track-head', '.01em'],
    ['--x-track-body', '.02em'],
    ['--x-track-small', '.035em'],
  ])('%s = %s', (name, value) => {
    expect(token(name)).toBe(value);
  });
});
