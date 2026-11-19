import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const repo = (path: string): string =>
  readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8');

const lines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

it('Apple Root CA enters the Docker build context despite the *.pem rule', () => {
  const rules = lines(repo('.dockerignore'));
  const pem = rules.indexOf('**/*.pem');
  const exception = rules.indexOf('!apps/api/src/enrollment/apple-root-ca.pem');
  expect(pem).toBeGreaterThanOrEqual(0);
  // .dockerignore: the last matching rule wins, so the exception must come after.
  expect(exception).toBeGreaterThan(pem);
  expect(rules).toContain('.secrets');
});

it('nest build copies the PEM next to apple-root.js', () => {
  const nest = JSON.parse(repo('apps/api/nest-cli.json')) as {
    sourceRoot: string;
    compilerOptions: { assets?: { include: string }[] };
  };
  expect(nest.sourceRoot).toBe('src');
  expect(nest.compilerOptions.assets?.map((a) => a.include)).toContain('enrollment/*.pem');
});
