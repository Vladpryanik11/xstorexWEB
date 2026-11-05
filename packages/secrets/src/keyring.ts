export interface Keyring {
  current: number;
  keys: Map<number, Buffer>;
}
export function validVersion(value: string): boolean {
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
}

export function keyFor(keyring: Keyring, version: number): Buffer {
  if (!validVersion(String(version))) throw new SecretKeyMissingError('MASTER_KEY_CURRENT');
  const key = keyring.keys.get(version);
  if (key?.length !== 32) throw new SecretKeyMissingError(`MASTER_KEY_V${version}`);
  return key;
}

export function loadKeyring(env: NodeJS.ProcessEnv): Keyring {
  const current = env.MASTER_KEY_CURRENT ?? '';
  if (!validVersion(current)) throw new SecretKeyMissingError('MASTER_KEY_CURRENT');
  const keys = new Map<number, Buffer>();
  for (const [variable, value] of Object.entries(env)) {
    if (!variable.startsWith('MASTER_KEY_V')) continue;
    if (!validVersion(variable.slice('MASTER_KEY_V'.length)) || !value) {
      throw new SecretKeyMissingError(variable);
    }
    const key = Buffer.from(value, 'base64');
    if (key.length !== 32 || key.toString('base64') !== value) {
      throw new SecretKeyMissingError(variable);
    }
    keys.set(Number(variable.slice('MASTER_KEY_V'.length)), key);
  }
  const keyring = { current: Number(current), keys };
  keyFor(keyring, keyring.current);
  return keyring;
}

import { SecretKeyMissingError } from './errors.js';
