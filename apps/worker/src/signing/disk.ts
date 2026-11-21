import { statfs } from 'node:fs/promises';

/** Not enough free space in the work dir; retryable once other signings finish. */
export class DiskFullError extends Error {
  constructor(
    readonly needed: number,
    readonly free: number,
  ) {
    super('not enough free disk space for signing');
    this.name = 'DiskFullError';
  }
}

export async function ensureFreeSpace(dir: string, bytesNeeded: number): Promise<void> {
  const fs = await statfs(dir);
  const free = fs.bavail * fs.bsize;
  if (free < bytesNeeded) throw new DiskFullError(bytesNeeded, free);
}
