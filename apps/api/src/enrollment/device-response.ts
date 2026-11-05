import { parsePlist } from '@xstore/ios';
import { udidSchema } from '@xstore/shared';
import { z } from 'zod';

const deviceResponse = z.object({
  UDID: udidSchema,
  PRODUCT: z.string().min(1).max(80),
  VERSION: z.string().min(1).max(80),
  CHALLENGE: z.string().min(1).max(256),
});

export function parseDeviceResponse(content: Buffer): {
  udid: string;
  product: string;
  version: string;
  challenge: string;
} {
  const fields = deviceResponse.parse(parsePlist(content));
  return {
    udid: fields.UDID,
    product: fields.PRODUCT,
    version: fields.VERSION,
    challenge: fields.CHALLENGE,
  };
}
