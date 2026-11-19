import plist from 'plist';

/**
 * Unsigned "Profile Service" payload: iOS asks the person to install it, then posts the signed
 * UDID, PRODUCT and VERSION with `Challenge` to the callback URL.
 */
export function buildEnrollmentProfile(input: {
  nonce: string;
  siteUrl: string;
  payloadUuid: string;
}): string {
  const site = input.siteUrl.replace(/\/+$/, '');
  return plist.build({
    PayloadType: 'Profile Service',
    PayloadIdentifier: 'ru.xstorex.enroll',
    PayloadDisplayName: 'Xstore — подключение iPhone',
    PayloadOrganization: 'Xstore',
    PayloadUUID: input.payloadUuid,
    PayloadVersion: 1,
    PayloadContent: {
      URL: `${site}/api/v1/enrollment/callback?s=${encodeURIComponent(input.nonce)}`,
      DeviceAttributes: ['UDID', 'PRODUCT', 'VERSION'],
      Challenge: input.nonce,
    },
  });
}
