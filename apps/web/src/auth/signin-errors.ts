import { ApiClientError, ErrorCode, errorMessages, signinMessages } from '@xstore/shared';

/** Buyer sign-in: maps an API failure onto the texts in `@xstore/shared` errors. */
export function signinErrorText(err: unknown, step: 'password' | 'code' = 'code'): string {
  if (err instanceof ApiClientError) {
    if (err.status === 429 || err.code === ErrorCode.RATE_LIMITED) {
      // Password sign-in is locked per email, the code from the email still works.
      return step === 'password'
        ? signinMessages.PASSWORD_LOCKED
        : signinMessages.TOO_MANY_ATTEMPTS;
    }
    if (err.code === ErrorCode.INVALID_CREDENTIALS || err.code === ErrorCode.CODE_INVALID) {
      return errorMessages[err.code];
    }
    if (err.code === ErrorCode.VALIDATION) return signinMessages.CHECK_EMAIL;
  }
  return signinMessages.FAILED;
}
