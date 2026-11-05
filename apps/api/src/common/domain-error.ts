import type { ErrorCode } from '@xstore/shared';

/** An expected failure with a stable code; the filter answers `{ code, message }` with `status`. */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = 'DomainError';
  }
}
