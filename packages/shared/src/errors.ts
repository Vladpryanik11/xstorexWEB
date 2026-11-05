import { z } from 'zod';

export const ErrorCode = {
  INTERNAL: 'INTERNAL',
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
  CONFLICT: 'CONFLICT',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** User-facing message for every code. Later milestones add codes and messages here only. */
export const errorMessages: Record<ErrorCode, string> = {
  NOT_FOUND: 'Не найдено',
  UNAUTHORIZED: 'Требуется вход',
  FORBIDDEN: 'Нет доступа',
  RATE_LIMITED: 'Слишком много запросов, попробуйте позже',
  VALIDATION: 'Некорректные данные',
  INTERNAL: 'Внутренняя ошибка сервера',
  CONFLICT: 'Конфликт данных',
  INVALID_CREDENTIALS: 'Неверная почта, пароль или код',
};

export const apiErrorSchema = z.object({
  code: z.enum(ErrorCode),
  message: z.string().min(1),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
