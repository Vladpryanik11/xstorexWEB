import plist from 'plist';
import { describe, expect, it } from 'vitest';
import { DeviceResponseError, parseDeviceResponse } from './device-response.js';

const UDID = '00008110-001A2B3C4D5E6F70';
const CHALLENGE = 'q1w2e3r4t5y6u7i8o9p0a1s2d3f4g5h6j7k8l9z0x1c';

const answer = (fields: Record<string, unknown>): Buffer =>
  Buffer.from(plist.build(fields as plist.PlistObject), 'utf8');

describe('parseDeviceResponse', () => {
  it('reads UDID, PRODUCT, VERSION and CHALLENGE', () => {
    expect(
      parseDeviceResponse(
        answer({ UDID, PRODUCT: 'iPhone16,1', VERSION: '22B83', CHALLENGE, IMEI: '35 000' }),
      ),
    ).toEqual({ udid: UDID, product: 'iPhone16,1', version: '22B83', challenge: CHALLENGE });
  });

  it('accepts the 40-character UDID of older devices and iPad products', () => {
    const old = 'a'.repeat(40);
    expect(
      parseDeviceResponse(answer({ UDID: old, PRODUCT: 'iPad8,1', VERSION: '18.1', CHALLENGE })),
    ).toMatchObject({ udid: old, product: 'iPad8,1' });
  });

  it.each([
    ['not a plist', Buffer.from('hello')],
    ['an array', answer([1, 2] as unknown as Record<string, unknown>)],
    ['no UDID', answer({ PRODUCT: 'iPhone16,1', VERSION: '22B83', CHALLENGE })],
    ['a malformed UDID', answer({ UDID: 'xyz', PRODUCT: 'iPhone16,1', VERSION: '1', CHALLENGE })],
    ['no CHALLENGE', answer({ UDID, PRODUCT: 'iPhone16,1', VERSION: '22B83' })],
    ['a numeric PRODUCT', answer({ UDID, PRODUCT: 5, VERSION: '22B83', CHALLENGE })],
    ['an odd PRODUCT', answer({ UDID, PRODUCT: '<script>', VERSION: '22B83', CHALLENGE })],
    ['an odd VERSION', answer({ UDID, PRODUCT: 'iPhone16,1', VERSION: 'x'.repeat(64), CHALLENGE })],
  ])('refuses %s', (_name, body) => {
    expect(() => parseDeviceResponse(body)).toThrow(DeviceResponseError);
  });

  it('never puts the UDID into the error message', () => {
    try {
      parseDeviceResponse(answer({ UDID, PRODUCT: 'bad product', VERSION: '1', CHALLENGE }));
      expect.unreachable();
    } catch (err) {
      expect(String((err as Error).message)).not.toContain(UDID);
    }
  });
});
