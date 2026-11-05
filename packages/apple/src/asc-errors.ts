export type AscErrorKind =
  | 'auth'
  | 'rate_limited'
  | 'no_slots'
  | 'already_exists'
  | 'cert_limit'
  | 'not_found'
  | 'other';
export class AscError extends Error {
  constructor(
    public readonly kind: AscErrorKind,
    public readonly status: number,
    public readonly retryAfterSec?: number,
  ) {
    const messages: Record<AscErrorKind, string> = {
      auth: 'Apple отклонил ключ доступа',
      rate_limited: 'Apple временно ограничил запросы',
      no_slots: 'В аккаунте Apple нет свободных мест для устройств',
      already_exists: 'Объект уже зарегистрирован в Apple',
      cert_limit: 'В аккаунте Apple закончился лимит сертификатов',
      not_found: 'Объект не найден в Apple',
      other: 'Не удалось выполнить запрос к Apple',
    };
    super(messages[kind]);
    this.name = 'AscError';
  }
}
export function classifyAscError(status: number, body: unknown): AscErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limited';
  if (status === 404) return 'not_found';
  if (status !== 409) return 'other';
  if (!body || typeof body !== 'object' || !('errors' in body) || !Array.isArray(body.errors))
    return 'other';
  const detail = body.errors
    .map((error: unknown) => {
      if (
        error &&
        typeof error === 'object' &&
        'detail' in error &&
        typeof error.detail === 'string'
      )
        return error.detail;
      return '';
    })
    .join('\n');
  if (/already exists/i.test(detail)) return 'already_exists';
  if (/maximum number of devices/i.test(detail)) return 'no_slots';
  if (/maximum number of certificates/i.test(detail)) return 'cert_limit';
  return 'other';
}
