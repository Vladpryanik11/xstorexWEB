import { z } from 'zod';

export const ErrorCode = {
  INTERNAL: 'INTERNAL',
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
  CATALOG_CONFLICT: 'CATALOG_CONFLICT',
  CATALOG_NOT_PUBLISHABLE: 'CATALOG_NOT_PUBLISHABLE',
  IPA_ENCRYPTED: 'IPA_ENCRYPTED',
  UPLOAD_TOO_LARGE: 'UPLOAD_TOO_LARGE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const apiErrorSchema = z.object({
  code: z.enum(ErrorCode),
  message: z.string().min(1),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
