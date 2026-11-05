import type { StoredPart } from '../storage/storage.service.js';

/** Admin uploads: at most 10 GiB per IPA. */
export const MAX_UPLOAD_BYTES = 10 * 1024 ** 3;
/** Multipart part size: 64 MiB. */
export const PART_SIZE = 64 * 1024 ** 2;
/** S3 limit on parts per multipart upload. */
export const MAX_PARTS = 10_000;

/** Number of parts for a file of `sizeBytes`; throws above 10 000 parts. */
export function planParts(sizeBytes: number, partSize = PART_SIZE): number {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw new RangeError('sizeBytes');
  if (!Number.isSafeInteger(partSize) || partSize <= 0) throw new RangeError('partSize');
  const parts = Math.ceil(sizeBytes / partSize);
  if (parts > MAX_PARTS) throw new RangeError(`${parts} parts exceed ${MAX_PARTS}`);
  return parts;
}

/**
 * True when S3 holds exactly parts 1…n of the plan with the planned sizes, so the assembled
 * object is the declared size (presigned PUTs do not bind the body length).
 */
export function checkUploadedParts(
  listed: StoredPart[],
  sizeBytes: number,
  partSize: number,
): boolean {
  const count = planParts(sizeBytes, partSize);
  if (listed.length !== count) return false;
  return listed.every((part, i) => {
    const expected = i === count - 1 ? sizeBytes - partSize * (count - 1) : partSize;
    return part.partNumber === i + 1 && part.size === expected;
  });
}
