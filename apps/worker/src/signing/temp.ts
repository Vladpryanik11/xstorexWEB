import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

/** Runs `fn` in a fresh private dir under `root` and always removes it afterwards. */
export async function withTempDir<T>(root: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(root, 'xstore-sign-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
