import { apiErrorSchema, errorMessages } from '@xstore/shared';

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
  }
}

export async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  if (!res.ok) {
    const error = apiErrorSchema.safeParse(await res.json().catch(() => null));
    throw new AdminApiError(
      res.status,
      error.success ? error.data.message : errorMessages.INTERNAL,
      error.success ? error.data.details : [],
    );
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export function mutate<T>(path: string, method: string, body?: unknown): Promise<T> {
  return adminRequest(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export const statusLabel: Record<string, string> = {
  draft: 'Черновик',
  published: 'Опубликовано',
  hidden: 'Скрыто',
};
export const blockerLabel: Record<string, string> = {
  NO_RIGHTS_BASIS: 'Укажите основание для распространения',
  NO_ICON: 'Добавьте иконку',
  NO_PUBLISHED_VERSION: 'Опубликуйте хотя бы одну версию',
  NO_CATEGORY: 'Выберите категорию',
  ENCRYPTED: 'Версия защищена FairPlay и не может быть опубликована',
};
export const errorText = (err: unknown): string =>
  err instanceof AdminApiError
    ? [err.message, ...err.details.map((d) => blockerLabel[d] ?? d)].join('. ')
    : err instanceof Error
      ? err.message
      : 'Не удалось выполнить действие';
