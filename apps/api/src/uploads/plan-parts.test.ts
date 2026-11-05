import { describe, expect, it } from 'vitest';
import { checkUploadedParts, MAX_UPLOAD_BYTES, PART_SIZE, planParts } from './plan-parts.js';

const MiB = 1024 ** 2;

describe('planParts', () => {
  it('splits 10 GiB into 160 parts', () => {
    expect(planParts(10 * 1024 ** 3)).toBe(160);
  });

  it('rounds the last part up', () => {
    expect(planParts(64 * MiB + 1)).toBe(2);
  });

  it('uses one part for a small file', () => {
    expect(planParts(1)).toBe(1);
  });

  it('throws above 10 000 parts', () => {
    expect(() => planParts(10_001 * 5 * MiB, 5 * MiB)).toThrow();
    expect(planParts(10_000 * 5 * MiB, 5 * MiB)).toBe(10_000);
  });

  it('rejects non-positive sizes', () => {
    expect(() => planParts(0)).toThrow();
  });

  it('exports the plan limits', () => {
    expect(PART_SIZE).toBe(64 * MiB);
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 ** 3);
  });
});

describe('checkUploadedParts', () => {
  const size = 70 * MiB;
  const listed = [
    { partNumber: 1, etag: '"a"', size: 64 * MiB },
    { partNumber: 2, etag: '"b"', size: 6 * MiB },
  ];

  it('accepts every part with the planned sizes', () => {
    expect(checkUploadedParts(listed, size, PART_SIZE)).toBe(true);
  });

  it('rejects a missing part', () => {
    expect(checkUploadedParts(listed.slice(0, 1), size, PART_SIZE)).toBe(false);
  });

  it('rejects a part of another size', () => {
    const bigger = [listed[0], { ...listed[1], size: 7 * MiB }] as typeof listed;
    expect(checkUploadedParts(bigger, size, PART_SIZE)).toBe(false);
  });

  it('rejects parts beyond the plan', () => {
    expect(
      checkUploadedParts([...listed, { partNumber: 3, etag: '"c"', size: 1 }], size, PART_SIZE),
    ).toBe(false);
  });
});
