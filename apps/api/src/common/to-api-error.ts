import { HttpException } from '@nestjs/common';
import { type ApiError, ErrorCode, errorMessages } from '@xstore/shared';
import { ZodError } from 'zod';
import { DomainError } from './domain-error.js';

function result(status: number, code: ErrorCode): { status: number; body: ApiError } {
  return { status, body: { code, message: errorMessages[code] } };
}

function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 401:
      return ErrorCode.UNAUTHORIZED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 429:
      return ErrorCode.RATE_LIMITED;
    default:
      return status >= 400 && status < 500 ? ErrorCode.VALIDATION : ErrorCode.INTERNAL;
  }
}

export function toApiError(err: unknown): { status: number; body: ApiError } {
  if (err instanceof DomainError) {
    const out = result(err.status, err.code);
    return err.details ? { ...out, body: { ...out.body, details: err.details } } : out;
  }
  if (err instanceof ZodError) return result(400, ErrorCode.VALIDATION);
  if (err instanceof HttpException) {
    const status = err.getStatus();
    const code = codeForStatus(status);
    return result(code === ErrorCode.INTERNAL ? 500 : status, code);
  }
  return result(500, ErrorCode.INTERNAL);
}
