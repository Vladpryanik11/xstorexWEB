import type { ErrorCode } from '@xstore/shared';

/**
 * An expected failure with a stable code; the filter answers `{ code, message, details? }` with
 * `status`. `details` carries machine-readable reasons (e.g. publish blockers), never user data.
 */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
    this.name = 'DomainError';
  }
}
