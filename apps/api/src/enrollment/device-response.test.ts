import { expect, it } from 'vitest';
import { parseDeviceResponse } from './device-response.js';

const udid = '00008110-001A2B3C4D5E6F70';
const plist = (extra = '') =>
  Buffer.from(
    `<?xml version="1.0"?><plist version="1.0"><dict><key>UDID</key><string>${udid}</string><key>PRODUCT</key><string>iPhone15,2</string><key>VERSION</key><string>22B83</string><key>CHALLENGE</key><string>n1</string>${extra}</dict></plist>`,
  );

it('parses device attributes and discards SERIAL and other extra fields', () => {
  expect(parseDeviceResponse(plist('<key>SERIAL</key><string>PRIVATE-SERIAL</string>'))).toEqual({
    udid,
    product: 'iPhone15,2',
    version: '22B83',
    challenge: 'n1',
  });
});

it('rejects missing, invalid and oversized fields', () => {
  for (const body of [
    Buffer.from('not plist'),
    Buffer.from('<plist><dict/></plist>'),
    Buffer.from(plist().toString().replace(udid, 'bad')),
    Buffer.from(plist().toString().replace('iPhone15,2', 'x'.repeat(500))),
  ]) {
    expect(() => parseDeviceResponse(body)).toThrow();
  }
});
