import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as pkijs from 'pkijs';
import { describe, expect, it } from 'vitest';
import { APPLE_DEVICE_CA_CN, verifyDeviceCms } from './apple-root.js';
import { CmsError } from './cms.js';
import { parseDeviceResponse } from './device-response.js';

/**
 * A real answer iOS posted to the profile service, checked against Apple Root CA only (no test
 * anchor). Runs only with `IOS_REAL_FIXTURE=<path to the raw POST body>`; the file holds a UDID,
 * so it lives outside git. Nothing here prints the UDID.
 *
 *   IOS_REAL_FIXTURE=/secure/ios-answer.der pnpm --filter @xstore/api exec vitest run device-response.real
 */
const fixture = process.env.IOS_REAL_FIXTURE;

const cn = (cert: X509Certificate): string | undefined => cert.subject.match(/^CN=(.+)$/m)?.[1];

describe.skipIf(!fixture)('real iOS answer', () => {
  const der = (): Buffer => readFileSync(fixture as string);

  it('chains to Apple Root CA through "Apple iPhone Device CA"', async () => {
    const { content, signer } = await verifyDeviceCms(der());
    const answer = parseDeviceResponse(content);
    // A boolean, so a failure never prints the UDID.
    expect(/^[0-9A-Fa-f-]{25,40}$/.test(answer.udid), 'UDID has the form of a UDID').toBe(true);
    expect(answer.product).toMatch(/^(iPhone|iPad)\d+,\d+$/);
    expect(answer.version.length).toBeGreaterThan(0);
    expect(answer.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Facts for the report: key type and size of the device certificate (no identifiers).
    const key = signer.publicKey;
    console.info('device key', key.asymmetricKeyType, key.asymmetricKeyDetails);
  });

  it('carries both Apple device intermediates', () => {
    const info = pkijs.ContentInfo.fromBER(new Uint8Array(der()));
    const signed = new pkijs.SignedData({ schema: info.content });
    const carried = (signed.certificates ?? [])
      .filter((c): c is pkijs.Certificate => c instanceof pkijs.Certificate)
      .map((c) => new X509Certificate(Buffer.from(c.toSchema().toBER(false))));
    const names = carried.map(cn);
    expect(names).toContain(APPLE_DEVICE_CA_CN);
    expect(names).toContain('Apple iPhone Certification Authority');
    // Facts for the report: dates are not checked for device answers (see verifyDeviceCms).
    for (const cert of carried.filter((c) => c.ca)) {
      console.info('intermediate', cn(cert), 'valid to', cert.validTo);
    }
  });

  it('a changed byte breaks the signature', async () => {
    const body = Buffer.from(der());
    const at = body.indexOf('<key>PRODUCT</key>');
    expect(at).toBeGreaterThan(0);
    body[at + 5] = 'p'.charCodeAt(0);
    await expect(verifyDeviceCms(body)).rejects.toBeInstanceOf(CmsError);
  });
});
