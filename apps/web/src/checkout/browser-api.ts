import { type ApiClient, createApiClient } from '@xstore/shared';

let client: ApiClient | null = null;

/** Client for the browser: same-origin `/api/v1` through the Next.js rewrite, cookies included. */
export function browserApi(): ApiClient {
  client ??= createApiClient({ baseUrl: '' });
  return client;
}
