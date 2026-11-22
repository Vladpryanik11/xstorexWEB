import { afterEach, describe, expect, it, vi } from 'vitest';
import { INTRO_KEY, introDecision, introScript } from './decision';

const base = { search: '', seen: null, reducedMotion: false, webdriver: false };

describe('introDecision (spec 2026-11-22-intro)', () => {
  it('shows on the first visit', () => {
    expect(introDecision(base)).toBe(true);
  });

  it.each([
    ['after it was seen', { seen: 'seen' }],
    ['with reduced motion', { reducedMotion: true }],
    ['in an automated browser', { webdriver: true }],
    ['on a shared app link', { search: '?app=telegram' }],
  ])('stays hidden %s', (_, patch) => {
    expect(introDecision({ ...base, ...patch })).toBe(false);
  });

  it('?intro=1 always shows it', () => {
    expect(
      introDecision({ search: '?intro=1', seen: 'seen', reducedMotion: true, webdriver: true }),
    ).toBe(true);
  });
});

describe('introScript', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-intro');
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  const run = () => new Function(introScript)();

  it('marks <html> before paint on the first visit', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    run();
    expect(document.documentElement.dataset.intro).toBe('on');
  });

  it('leaves <html> alone once seen', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    localStorage.setItem(INTRO_KEY, 'seen');
    run();
    expect(document.documentElement.hasAttribute('data-intro')).toBe(false);
  });

  it('leaves <html> alone with reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    run();
    expect(document.documentElement.hasAttribute('data-intro')).toBe(false);
  });
});
