import { HttpException } from '@nestjs/common';
import { type ApiError, ErrorCode } from '@xstore/shared';
import { ZodError } from 'zod';

const messages: Record<ErrorCode, string> = {
  NOT_FOUND: 'Не найдено',
  UNAUTHORIZED: 'Требуется вход',
  FORBIDDEN: 'Нет доступа',
  RATE_LIMITED: 'Слишком много запросов, попробуйте позже',
  VALIDATION: 'Некорректные данные',
  INTERNAL: 'Внутренняя ошибка сервера',
  CATALOG_CONFLICT: 'Конфликт данных каталога',
  CATALOG_NOT_PUBLISHABLE: 'Приложение не готово к публикации',
  IPA_ENCRYPTED: 'Этот IPA зашифрован и не может быть опубликован',
  UPLOAD_TOO_LARGE: 'Размер файла превышает допустимый лимит',
};

function result(status: number, code: ErrorCode): { status: number; body: ApiError } {
  return { status, body: { code, message: messages[code] } };
}

function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 401:
      return ErrorCode.UNAUTHORIZED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 429:
      return ErrorCode.RATE_LIMITED;
    default:
      return status >= 400 && status < 500 ? ErrorCode.VALIDATION : ErrorCode.INTERNAL;
  }
}

export function toApiError(err: unknown): { status: number; body: ApiError } {
  if (err instanceof ZodError) return result(400, ErrorCode.VALIDATION);
  if (err instanceof HttpException) {
    const status = err.getStatus();
    const code = codeForStatus(status);
    return result(code === ErrorCode.INTERNAL ? 500 : status, code);
  }
  return result(500, ErrorCode.INTERNAL);
}
