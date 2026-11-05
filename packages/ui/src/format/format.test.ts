import { describe, expect, it } from 'vitest';
import { formatBytes, formatRating } from './format';

describe('formatBytes', () => {
  it('uses Russian units', () => {
    expect(formatBytes(1_288_490_189)).toBe('1,2 ГБ');
    expect(formatBytes(850 * 1024 ** 2)).toBe('850 МБ');
  });

  it('drops a trailing zero and handles small sizes', () => {
    expect(formatBytes(2 * 1024 ** 3)).toBe('2 ГБ');
    expect(formatBytes(512)).toBe('512 Б');
    expect(formatBytes(0)).toBe('0 Б');
    expect(formatBytes(1536)).toBe('1,5 КБ');
  });

  it('rounds up to the next unit instead of showing 1024', () => {
    expect(formatBytes(1024 ** 3 - 1)).toBe('1 ГБ');
  });
});

describe('formatRating', () => {
  it('uses a decimal comma with one digit', () => {
    expect(formatRating(4.5)).toBe('4,5');
    expect(formatRating(4)).toBe('4,0');
    expect(formatRating(4.46)).toBe('4,5');
  });
});
