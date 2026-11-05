/** Why `inspectIpa` refused an archive. Russian texts live in `@xstore/shared` `errorMessages`. */
export const IPA_REJECT_CODES = [
  'IPA_NOT_ZIP',
  'IPA_UNSAFE_PATH',
  'IPA_ZIP_BOMB',
  'IPA_NO_APP',
  'IPA_MANY_APPS',
  'IPA_BAD_PLIST',
  'IPA_NO_BINARY',
] as const;

export type IpaRejectCode = (typeof IPA_REJECT_CODES)[number];

/** Thrown inside the inspector to stop with a reject code. */
export class IpaRejectError extends Error {
  constructor(readonly reason: IpaRejectCode) {
    super(reason);
    this.name = 'IpaRejectError';
  }
}
