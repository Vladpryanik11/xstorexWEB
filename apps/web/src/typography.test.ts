import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec 2026-11-17-typography §3: every size comes from the --x-type-* scale.
const roots = [join(__dirname, '..'), join(__dirname, '../../../packages/ui/src')];
const files = roots.flatMap((root) =>
  readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.css') && !f.includes('node_modules') && !f.startsWith('.next'))
    .map((f) => join(root, f)),
);
const name = (f: string) => relative(join(__dirname, '../../..'), f);
// The decorative XSTORE word behind the home hero is the one size outside the scale.
const strip = (css: string) => css.replace(/\.word\s*\{[^}]*\}/, '');

describe('typography follows the scale', () => {
  it('finds the stylesheets', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map(name))('%s', (f) => {
    const css = strip(readFileSync(join(__dirname, '../../..', f), 'utf8'));
    expect(css).not.toMatch(/--x-system|helvetica/i);
    expect(css).not.toMatch(/(^|[\s;{])font-size\s*:/);
    for (const [, value] of css.matchAll(/(?:^|[\s;{])font\s*:\s*([^;]+);/g)) {
      expect(value?.trim()).toMatch(/^(inherit|var\(--x-type-[a-z0-9]+\))$/);
    }
  });
});
