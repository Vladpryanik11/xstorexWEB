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
  UPLOAD_TOO_LARGE: 'UPLOAD_TOO_LARGE',
  IPA_NOT_ZIP: 'IPA_NOT_ZIP',
  IPA_UNSAFE_PATH: 'IPA_UNSAFE_PATH',
  IPA_ZIP_BOMB: 'IPA_ZIP_BOMB',
  IPA_NO_APP: 'IPA_NO_APP',
  IPA_MANY_APPS: 'IPA_MANY_APPS',
  IPA_BAD_PLIST: 'IPA_BAD_PLIST',
  IPA_NO_BINARY: 'IPA_NO_BINARY',
  DUPLICATE_VERSION: 'DUPLICATE_VERSION',
  PUBLISH_BLOCKED: 'PUBLISH_BLOCKED',
  ENROLLMENT_EXPIRED: 'ENROLLMENT_EXPIRED',
  ENROLLMENT_INVALID: 'ENROLLMENT_INVALID',
  DEVICE_OWNED: 'DEVICE_OWNED',
  ACCOUNT_BLOCKED: 'ACCOUNT_BLOCKED',
  CODE_INVALID: 'CODE_INVALID',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
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
  UPLOAD_TOO_LARGE: 'Файл больше допустимого размера',
  IPA_NOT_ZIP: 'Файл не является IPA-архивом или повреждён',
  IPA_UNSAFE_PATH: 'В архиве есть недопустимые пути к файлам',
  IPA_ZIP_BOMB: 'Архив подозрительно сильно сжат и отклонён',
  IPA_NO_APP: 'В архиве нет приложения: ожидается Payload/<имя>.app с Info.plist',
  IPA_MANY_APPS: 'В архиве больше одного приложения',
  IPA_BAD_PLIST: 'Не удалось прочитать Info.plist или в нём нет обязательных полей',
  IPA_NO_BINARY: 'В приложении нет исполняемого файла iOS',
  DUPLICATE_VERSION: 'Эта версия уже загружена',
  PUBLISH_BLOCKED: 'Нельзя опубликовать: заполните обязательные поля',
  ENROLLMENT_EXPIRED: 'Время подключения истекло. Попробуйте ещё раз.',
  ENROLLMENT_INVALID: 'Не удалось проверить ответ устройства. Попробуйте ещё раз.',
  DEVICE_OWNED: 'Это устройство уже привязано к другому аккаунту. Войдите в него или напишите в поддержку.',
  ACCOUNT_BLOCKED: 'Аккаунт заблокирован',
  CODE_INVALID: 'Неверный или устаревший код',
  EMAIL_TAKEN: 'Эта почта уже привязана к другому аккаунту',
};

export const apiErrorSchema = z.object({
  code: z.enum(ErrorCode),
  message: z.string().min(1),
  /** Machine-readable reasons, e.g. the blockers of `PUBLISH_BLOCKED`. */
  details: z.array(z.string()).optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
