import { type Algorithm, hash, verify } from '@node-rs/argon2';

// `Algorithm` is an ambient const enum, unusable under verbatimModuleSyntax; 2 = Argon2id.
const ARGON2ID = 2 as Algorithm;

// OWASP baseline for argon2id: 19 MiB memory, 2 iterations, 1 lane.
const OPTIONS = { algorithm: ARGON2ID, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(stored: string, plain: string): Promise<boolean> {
  try {
    return await verify(stored, plain);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;

/**
 * A hash to verify against when no account matches, so an unknown email costs the same time as
 * a wrong password. Computed once per process.
 */
export function dummyPasswordHash(): Promise<string> {
  dummy ??= hashPassword('xstore-dummy-password');
  return dummy;
}
