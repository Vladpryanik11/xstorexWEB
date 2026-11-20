import { describe, expect, it } from 'vitest';
import { waitPhase } from './wait-phase.js';

const since = new Date('2026-11-20T10:00:00Z');
const at = (hours: number) => new Date(since.getTime() + hours * 3600_000);

describe('waitPhase', () => {
  it('готов до = начало + 24 часа', () => {
    expect(waitPhase(since, at(1)).readyBy).toEqual(at(24));
  });

  it('до 20 часов — готовим, полоска растёт', () => {
    const p = waitPhase(since, at(6));
    expect(p.phase).toBe('preparing');
    expect(p.progress).toBeCloseTo(0.25);
    expect(p.hoursLeft).toBe(18);
  });

  it('с 20 до 24 часов — почти готово, часы округляются вверх', () => {
    expect(waitPhase(since, at(20)).phase).toBe('almost');
    const p = waitPhase(since, at(21.5));
    expect(p.phase).toBe('almost');
    expect(p.hoursLeft).toBe(3);
  });

  it('после 24 часов — задерживаемся', () => {
    const p = waitPhase(since, at(24.1));
    expect(p.phase).toBe('late');
    expect(p.progress).toBe(1);
    expect(p.hoursLeft).toBe(0);
  });

  it('часы в будущем (разница часов) не дают отрицательного прогресса', () => {
    expect(waitPhase(since, at(-1)).progress).toBe(0);
  });
});
