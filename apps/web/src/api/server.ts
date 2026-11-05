import 'server-only';
import { type ApiClient, ApiClientError, createApiClient } from '@xstore/shared';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { cache } from 'react';

/**
 * API client for server components. Calls the API directly (`API_INTERNAL_URL`), not through
 * the `/api` rewrite, and forwards the visitor's cookies so M2 sessions reach the API.
 * Cached per request: `generateMetadata` and the page share one client.
 */
export const serverApi = cache(async (): Promise<ApiClient> => {
  // headers() first: it makes every catalog page dynamic, so `next build` never prerenders one
  // (the Docker build has no API to call) and the URL is read at request time.
  const cookie = (await headers()).get('cookie');
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!baseUrl) throw new Error('API_INTERNAL_URL is not set');
  return createApiClient({ baseUrl, headers: cookie ? { cookie } : {} });
});

/** Runs an API call; 404 (and 400 for a broken cursor or slug) becomes the 404 page. */
export async function orNotFound<T>(call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch (err) {
    if (err instanceof ApiClientError && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
}
