import { ApiClientError, ErrorCode, errorMessages } from '@xstore/shared';

export const TOO_MANY = 'Слишком много попыток, попробуйте позже';

/** Human text for a failed sign-in step; the wording follows spec v2 §5. */
export function signinErrorText(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.status === 429 || err.code === ErrorCode.RATE_LIMITED) return TOO_MANY;
    if (err.code === ErrorCode.INVALID_CREDENTIALS) return 'Неверная почта или пароль';
    if (err.code === ErrorCode.CODE_INVALID) return errorMessages.CODE_INVALID;
    if (err.code === ErrorCode.VALIDATION) return 'Проверьте почту и попробуйте ещё раз';
  }
  return 'Не получилось войти. Попробуйте ещё раз.';
}
