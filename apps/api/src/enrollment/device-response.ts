import { udidSchema } from '@xstore/shared';
import plist from 'plist';

/** The answer iOS signed is not a usable device answer. The message never carries its values. */
export class DeviceResponseError extends Error {
  override name = 'DeviceResponseError';
}

export type DeviceResponse = {
  udid: string;
  /** Model identifier, e.g. `iPhone16,1`. */
  product: string;
  /** iOS build, e.g. `22B83`. */
  version: string;
  challenge: string;
};

const PRODUCT = /^[A-Za-z]{2,16}\d{1,3},\d{1,3}$/;
const VERSION = /^[0-9A-Za-z.]{1,32}$/;
const CHALLENGE = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Reads the plist iOS posts to the profile service (the content of the verified CMS message):
 * `UDID`, `PRODUCT`, `VERSION` and `CHALLENGE`; other keys (IMEI, SERIAL, …) are ignored.
 */
export function parseDeviceResponse(content: Buffer): DeviceResponse {
  let parsed: unknown;
  try {
    parsed = plist.parse(content.toString('utf8'));
  } catch {
    throw new DeviceResponseError('Device answer is not a plist');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new DeviceResponseError('Device answer is not a dictionary');
  }
  const fields = parsed as Record<string, unknown>;
  const text = (key: string, pattern: RegExp): string => {
    const value = fields[key];
    if (typeof value !== 'string' || !pattern.test(value)) {
      throw new DeviceResponseError(`Device answer has no valid ${key}`);
    }
    return value;
  };
  const udid = fields.UDID;
  if (typeof udid !== 'string' || !udidSchema.safeParse(udid).success) {
    throw new DeviceResponseError('Device answer has no valid UDID');
  }
  return {
    udid,
    product: text('PRODUCT', PRODUCT),
    version: text('VERSION', VERSION),
    challenge: text('CHALLENGE', CHALLENGE),
  };
}
