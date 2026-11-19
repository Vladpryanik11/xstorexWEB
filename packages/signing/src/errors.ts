export type SigningErrorCode =
  | 'P12_INVALID'
  | 'PROFILE_INVALID'
  | 'UDID_NOT_IN_PROFILE'
  | 'CERT_NOT_IN_PROFILE'
  | 'KIT_EXPIRED'
  | 'NOT_WILDCARD'
  | 'ALL_DEVICES_PROFILE'
  | 'CERT_REVOKED';

/** A supplier kit is refused. The message is the code only: never the file or the password. */
export class SigningError extends Error {
  override name = 'SigningError';
  constructor(readonly code: SigningErrorCode) {
    super(code);
  }
}
