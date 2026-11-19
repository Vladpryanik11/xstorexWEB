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
  DEVICE_LIMIT: 'DEVICE_LIMIT',
  NO_ACCESS: 'NO_ACCESS',
  ENROLLMENT_FAILED: 'ENROLLMENT_FAILED',
  ENROLLMENT_UNAVAILABLE: 'ENROLLMENT_UNAVAILABLE',
  ACCOUNT_BLOCKED: 'ACCOUNT_BLOCKED',
  CODE_INVALID: 'CODE_INVALID',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  CHECKOUT_IN_PROGRESS: 'CHECKOUT_IN_PROGRESS',
  CHECKOUT_SETTLED: 'CHECKOUT_SETTLED',
  PLAN_UNAVAILABLE: 'PLAN_UNAVAILABLE',
  PLAN_PRICE_REQUIRED: 'PLAN_PRICE_REQUIRED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_PROVIDER_DOWN: 'PAYMENT_PROVIDER_DOWN',
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  GRANT_STAFF_EMAIL: 'GRANT_STAFF_EMAIL',
  REFUND_NOT_PAID: 'REFUND_NOT_PAID',
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
  INVALID_CREDENTIALS: 'Неверная почта или пароль',
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
  DEVICE_OWNED:
    'Это устройство уже подключено к другому доступу. Войдите с почтой, с которой его подключали, или напишите в поддержку.',
  DEVICE_LIMIT: 'К вашему доступу уже подключено другое устройство.',
  NO_ACCESS: 'Подключить устройство можно при активном доступе. Сначала оформите доступ.',
  ENROLLMENT_FAILED: 'Не получилось подключить устройство. Попробуйте ещё раз.',
  ENROLLMENT_UNAVAILABLE: 'Подключение сейчас недоступно. Попробуйте позже.',
  ACCOUNT_BLOCKED: 'Аккаунт заблокирован',
  CODE_INVALID: 'Неверный или устаревший код',
  EMAIL_TAKEN: 'Эта почта уже привязана к другому аккаунту',
  CHECKOUT_IN_PROGRESS: 'Оплата уже начата, подождите несколько секунд',
  CHECKOUT_SETTLED: 'Эта оплата уже завершена. Начните новую',
  PLAN_UNAVAILABLE: 'Подписка сейчас недоступна',
  PLAN_PRICE_REQUIRED: 'Укажите цену, чтобы создать тариф',
  PAYMENT_PENDING: 'Проверяем оплату',
  PAYMENT_FAILED: 'Оплата не прошла. Попробуйте ещё раз',
  PAYMENT_PROVIDER_DOWN: 'Платёжный сервис не отвечает. Попробуйте через минуту',
  WEAK_PASSWORD: 'Пароль должен быть от 8 до 128 символов',
  GRANT_STAFF_EMAIL: 'Эта почта принадлежит сотруднику, выдать на неё доступ нельзя',
  REFUND_NOT_PAID: 'Отметить возврат можно только у оплаченного заказа',
};

/** Sign-in texts that are not one per code: shown by the buyer and staff sign-in forms. */
export const signinMessages = {
  /** Any 429 on a sign-in step (password, code request, code check). */
  TOO_MANY_ATTEMPTS: 'Слишком много попыток, попробуйте позже',
  /** Staff sign in with a TOTP code as well; INVALID_CREDENTIALS covers all three fields. */
  STAFF_INVALID_CREDENTIALS: 'Неверная почта, пароль или код из приложения',
  CHECK_EMAIL: 'Проверьте почту и попробуйте ещё раз',
  FAILED: 'Не получилось войти. Попробуйте ещё раз.',
} as const;

export const apiErrorSchema = z.object({
  code: z.enum(ErrorCode),
  message: z.string().min(1),
  /** Machine-readable reasons, e.g. the blockers of `PUBLISH_BLOCKED`. */
  details: z.array(z.string()).optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
