import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = __dirname;
const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((f) =>
  f.endsWith('.module.css'),
);
const read = (f: string) => readFileSync(join(root, f), 'utf8');

/** Body of the first rule whose selector is exactly `selector`. */
function rule(file: string, selector: string): string {
  const css = read(file);
  const i = css.indexOf(`${selector} {`);
  if (i < 0) throw new Error(`${selector} not found in ${file}`);
  return css.slice(i, css.indexOf('}', i));
}

describe('ui styles follow palette E (spec 2026-11-17 §3–4)', () => {
  it.each(files)('%s has no diyorde-era literals or grey shadows', (f) => {
    const css = read(f);
    expect(css).not.toMatch(/--x-(ink|page|surface|glass|header-gradient|quiet)(?![\w-])/);
    expect(css).not.toMatch(/rgba\((207|33, 70, 128|0, 0, 0)/);
    expect(css).not.toMatch(/#3a507a|#626771/i);
    expect(css).not.toMatch(/12\.5rem|1\.125rem/);
  });

  it.each([
    ['button/Button.module.css', '.btn'],
    ['chip/Chip.module.css', '.chip'],
    ['search/SearchField.module.css', '.field'],
  ])('%s %s is a pill', (f, sel) => {
    expect(rule(f, sel)).toContain('border-radius: var(--x-radius-pill)');
  });

  it('active chip is blue', () => {
    expect(rule('chip/Chip.module.css', '.chip[aria-current="page"]')).toContain(
      'background: var(--x-blue)',
    );
  });

  it('quiet button is sky with quiet text', () => {
    const q = rule('button/Button.module.css', '.quiet');
    expect(q).toContain('background: var(--x-sky-50)');
    expect(q).toContain('color: var(--x-quiet-fg)');
  });

  it('chips and search use blue shadows', () => {
    expect(rule('chip/Chip.module.css', '.chip')).toContain('box-shadow: var(--x-shadow-sm)');
    // Search variant В+ (owner 2026-11-23): its own bluish shadow under a thin rim.
    expect(rule('search/SearchField.module.css', '.glass')).toContain(
      '--search-shadow: 0 4px 16px rgba(20, 73, 224, 0.08)',
    );
  });
});
