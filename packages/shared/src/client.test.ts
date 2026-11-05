import { describe, expect, it, vi } from 'vitest';
import { ApiClientError, createApiClient } from './index.js';

function fakeFetch(status: number, body: unknown) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

const card = { slug: 'telegram', name: 'Telegram' };

describe('createApiClient', () => {
  it('builds URLs, passes headers and parses the response', async () => {
    const fetch = fakeFetch(200, { items: [card], nextCursor: 'c2' });
    const api = createApiClient({ baseUrl: 'http://api:3001/', headers: { cookie: 'a=b' }, fetch });
    const page = await api.search('яндекс карты', 'c1');
    expect(page).toEqual({ items: [card], nextCursor: 'c2' });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      'http://api:3001/api/v1/catalog/search?q=%D1%8F%D0%BD%D0%B4%D0%B5%D0%BA%D1%81+%D0%BA%D0%B0%D1%80%D1%82%D1%8B&cursor=c1',
    );
    expect(new Headers(init?.headers).get('cookie')).toBe('a=b');
  });

  it('encodes slugs in paths', async () => {
    const fetch = fakeFetch(200, { items: [], nextCursor: null });
    await createApiClient({ baseUrl: 'http://api', fetch }).category('a/b');
    expect(String(fetch.mock.calls[0]?.[0])).toBe('http://api/api/v1/catalog/categories/a%2Fb');
  });

  it('throws ApiClientError on { code, message } bodies', async () => {
    const fetch = fakeFetch(404, { code: 'NOT_FOUND', message: 'Не найдено' });
    const err = await createApiClient({ baseUrl: 'http://api', fetch })
      .app('nope')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'Не найдено' });
  });

  it('throws INTERNAL when the error body is not an API error', async () => {
    const fetch = vi.fn(
      async (_url: string | URL | Request) => new Response('Bad Gateway', { status: 502 }),
    );
    await expect(createApiClient({ baseUrl: 'http://api', fetch }).home()).rejects.toMatchObject({
      status: 502,
      code: 'INTERNAL',
    });
  });

  it('rejects a response that does not match the schema', async () => {
    const fetch = fakeFetch(200, { items: [{ slug: 1 }], nextCursor: null });
    await expect(createApiClient({ baseUrl: 'http://api', fetch }).list('top')).rejects.toThrow();
  });
});

describe('endpoints', () => {
  it.each([
    ['home', (api: ReturnType<typeof createApiClient>) => api.home(), '/api/v1/catalog/home'],
    [
      'app',
      (api: ReturnType<typeof createApiClient>) => api.app('telegram'),
      '/api/v1/catalog/apps/telegram',
    ],
    [
      'categories',
      (api: ReturnType<typeof createApiClient>) => api.categories(),
      '/api/v1/catalog/categories',
    ],
    [
      'category',
      (api: ReturnType<typeof createApiClient>) => api.category('social', 'c1'),
      '/api/v1/catalog/categories/social?cursor=c1',
    ],
    [
      'list',
      (api: ReturnType<typeof createApiClient>) => api.list('top'),
      '/api/v1/catalog/lists/top',
    ],
  ])('%s calls the right path', async (_name, call, path) => {
    const fetch = vi.fn(
      async (_url: string | URL | Request) => new Response('{}', { status: 200 }),
    );
    await call(createApiClient({ baseUrl: 'http://api', fetch })).catch(() => undefined);
    expect(String(fetch.mock.calls[0]?.[0] ?? '')).toBe(`http://api${path}`);
  });
});
