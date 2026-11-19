import { expect, it } from 'vitest';
import { rechainAfterRefund } from './rechain.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(Date.UTC(2026, 10, 18, 12));
const at = (days: number) => new Date(NOW.getTime() + days * DAY);
const right = (id: string, from: number, to: number) => ({
  id,
  startsAt: at(from),
  expiresAt: at(to),
});

it('pulls the period chained after a refunded current period to now', () => {
  const a = right('a', -5, 25);
  const b = right('b', 25, 55);
  expect(rechainAfterRefund([a, b], a, NOW)).toEqual([
    {
      id: 'b',
      from: { startsAt: at(25), expiresAt: at(55) },
      to: { startsAt: NOW, expiresAt: at(30) },
    },
  ]);
});

it('chains several later periods one after another, keeping each duration', () => {
  const a = right('a', -5, 25);
  const b = right('b', 25, 55);
  const c = right('c', 55, 65);
  expect(rechainAfterRefund([a, b, c], a, NOW).map((m) => [m.id, m.to])).toEqual([
    ['b', { startsAt: NOW, expiresAt: at(30) }],
    ['c', { startsAt: at(30), expiresAt: at(40) }],
  ]);
});

it('a refunded future period moves only what follows it, to the end of the current one', () => {
  const a = right('a', -5, 25);
  const b = right('b', 25, 55);
  expect(rechainAfterRefund([a, b], b, NOW)).toEqual([]);
  const c = right('c', 55, 60);
  expect(rechainAfterRefund([a, b, c], b, NOW)).toEqual([
    {
      id: 'c',
      from: { startsAt: at(55), expiresAt: at(60) },
      to: { startsAt: at(25), expiresAt: at(30) },
    },
  ]);
});

it('never moves a period later: a refunded past period leaves the running one alone', () => {
  const a = right('a', -40, -10);
  const b = right('b', -10, 20);
  expect(rechainAfterRefund([a, b], a, NOW)).toEqual([]);
});
