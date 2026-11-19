import plist from 'plist';
import { type SigningIdentity, signCms } from '../../src/enrollment/cms.js';
import type { SigningHash } from '../../src/enrollment/x509.js';

/** The fields iOS puts into its answer (the profile asks for UDID, PRODUCT, VERSION). */
export type DeviceAnswerFields = {
  UDID: string;
  PRODUCT: string;
  VERSION: string;
  CHALLENGE: string;
};

/**
 * The signed plist iOS posts to the profile service URL after the person installs the profile.
 * Shared by integration tests (`signDeviceResponse`) and the web e2e, which signs with the test
 * device from `enroll:test-ca`.
 */
export function signDeviceAnswer(
  fields: DeviceAnswerFields,
  device: SigningIdentity,
  options: { hash?: SigningHash } = {},
): Promise<Buffer> {
  return signCms(Buffer.from(plist.build({ ...fields }), 'utf8'), device, options);
}
