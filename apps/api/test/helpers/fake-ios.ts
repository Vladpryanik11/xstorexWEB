import { signCms } from '../../src/enrollment/cms.js';
import { createTestCa, testIdentity } from './enrollment-identity.js';

export type FakeIosCa = Awaited<ReturnType<typeof createTestCa>>;
export type DeviceFields = { udid: string; product: string; version: string; challenge: string };
export const TEST_UDID = '00008110-001A2B3C4D5E6F70';

export function devicePlist(fields: DeviceFields): Buffer {
  const values = {
    UDID: fields.udid,
    PRODUCT: fields.product,
    VERSION: fields.version,
    CHALLENGE: fields.challenge,
    SERIAL: 'DO-NOT-STORE',
  };
  const xml = (s: string) =>
    s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return Buffer.from(
    `<?xml version="1.0"?><plist version="1.0"><dict>${Object.entries(values)
      .map(([key, value]) => `<key>${key}</key><string>${xml(value)}</string>`)
      .join('')}</dict></plist>`,
  );
}

export async function signDeviceResponse(
  fields: Partial<DeviceFields> & { challenge: string },
  ca: FakeIosCa,
): Promise<Buffer> {
  const identity = await testIdentity('RSA', ca);
  return signCms(
    devicePlist({ udid: TEST_UDID, product: 'iPhone15,2', version: '22B83', ...fields }),
    identity,
  );
}
