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
      'section',
      (api: ReturnType<typeof createApiClient>) => api.section('removed', 'c2'),
      '/api/v1/catalog/sections/removed?cursor=c2',
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

describe('billing', () => {
  const plan = { code: 'month', title: 'Подписка на месяц', durationDays: 30, priceRub: 299 };

  it('getPlan and getOrder call their paths', async () => {
    const fetch = fakeFetch(200, plan);
    const api = createApiClient({ baseUrl: 'http://api', fetch });
    expect(await api.getPlan()).toEqual(plan);
    expect(String(fetch.mock.calls[0]?.[0])).toBe('http://api/api/v1/billing/plan');
    const order = {
      id: 'o/1',
      status: 'pending',
      amountRub: 299,
      paidAt: null,
      returnTo: null,
      accessUntil: null,
      paymentUrl: null,
    };
    const f2 = fakeFetch(200, order);
    expect(await createApiClient({ baseUrl: 'http://api', fetch: f2 }).getOrder('o/1')).toEqual(
      order,
    );
    expect(String(f2.mock.calls[0]?.[0])).toBe('http://api/api/v1/billing/orders/o%2F1');
  });

  it('checkout posts JSON and returns the redirect', async () => {
    const fetch = fakeFetch(200, { orderId: 'o1', redirectUrl: 'https://pay/x' });
    const api = createApiClient({ baseUrl: 'http://api', fetch, headers: { origin: 'http://s' } });
    const body = {
      checkoutKey: '3f0c2a52-5b0e-4c1c-9d3e-0b6f6a1f8a11',
      email: 'a@b.ru',
      acceptTerms: true as const,
    };
    expect(await api.checkout(body)).toEqual({ orderId: 'o1', redirectUrl: 'https://pay/x' });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://api/api/v1/billing/checkout');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(body);
    const headers = new Headers(init?.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('origin')).toBe('http://s');
  });

  it('checkout surfaces API errors', async () => {
    const fetch = fakeFetch(409, { code: 'CHECKOUT_IN_PROGRESS', message: 'x' });
    const err = await createApiClient({ baseUrl: 'http://api', fetch })
      .checkout({
        checkoutKey: '3f0c2a52-5b0e-4c1c-9d3e-0b6f6a1f8a11',
        email: 'a@b.ru',
        acceptTerms: true,
      })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 409, code: 'CHECKOUT_IN_PROGRESS' });
  });

  it('getAccess parses the active date', async () => {
    const fetch = fakeFetch(200, {
      state: {
        kind: 'active',
        until: '2026-12-18T12:00:00.000Z',
        subscriptionId: 's1',
        device: { model: 'iPhone 15 Pro Max', family: 'iphone', ready: false, needsHelp: true },
      },
      email: 'a@b.ru',
      hasPassword: false,
    });
    const access = await createApiClient({ baseUrl: 'http://api', fetch }).getAccess();
    expect(String(fetch.mock.calls[0]?.[0])).toBe('http://api/api/v1/access');
    expect(access.state).toEqual({
      kind: 'active',
      until: new Date('2026-12-18T12:00:00.000Z'),
      subscriptionId: 's1',
      device: { model: 'iPhone 15 Pro Max', family: 'iphone', ready: false, needsHelp: true },
    });
    const none = await createApiClient({
      baseUrl: 'http://api',
      fetch: fakeFetch(200, { state: { kind: 'none' } }),
    }).getAccess();
    expect(none).toEqual({ state: { kind: 'none' } });
  });
});

describe('buyer sign-in', () => {
  const noContent = () =>
    vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );

  it.each([
    [
      'login',
      (api: ReturnType<typeof createApiClient>) => api.login({ email: 'a@b.ru', password: 'p' }),
      '/api/v1/auth/login',
      { email: 'a@b.ru', password: 'p' },
    ],
    [
      'requestCode',
      (api: ReturnType<typeof createApiClient>) => api.requestCode({ email: 'a@b.ru' }),
      '/api/v1/auth/code/request',
      { email: 'a@b.ru' },
    ],
    [
      'verifyCode',
      (api: ReturnType<typeof createApiClient>) =>
        api.verifyCode({ email: 'a@b.ru', code: '123456' }),
      '/api/v1/auth/code/verify',
      { email: 'a@b.ru', code: '123456' },
    ],
    [
      'setPassword',
      (api: ReturnType<typeof createApiClient>) => api.setPassword({ password: 'secret12' }),
      '/api/v1/auth/password',
      { password: 'secret12' },
    ],
    [
      'redeemHandoff',
      (api: ReturnType<typeof createApiClient>) => api.redeemHandoff({ token: 't'.repeat(43) }),
      '/api/v1/auth/handoff/redeem',
      { token: 't'.repeat(43) },
    ],
    [
      'logout',
      (api: ReturnType<typeof createApiClient>) => api.logout(),
      '/api/v1/auth/logout',
      {},
    ],
  ])('%s posts to its path and resolves on 204', async (_name, call, path, body) => {
    const fetch = noContent();
    await expect(call(createApiClient({ baseUrl: 'http://api', fetch }))).resolves.toBeUndefined();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe(`http://api${path}`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(body);
  });

  it('issueHandoff asks for a one-time sign-in link', async () => {
    const fetch = fakeFetch(200, { token: 'k'.repeat(43), expiresAt: '2026-11-20T16:10:00.000Z' });
    const link = await createApiClient({ baseUrl: 'http://api', fetch }).issueHandoff();
    expect(link).toEqual({
      token: 'k'.repeat(43),
      expiresAt: new Date('2026-11-20T16:10:00.000Z'),
    });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://api/api/v1/auth/handoff');
    expect(init?.method).toBe('POST');
  });

  it('surfaces sign-in errors', async () => {
    const fetch = fakeFetch(401, { code: 'INVALID_CREDENTIALS', message: 'x' });
    await expect(
      createApiClient({ baseUrl: 'http://api', fetch }).login({ email: 'a@b.ru', password: 'p' }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    const weak = fakeFetch(400, { code: 'WEAK_PASSWORD', message: 'x' });
    await expect(
      createApiClient({ baseUrl: 'http://api', fetch: weak }).setPassword({ password: 'x' }),
    ).rejects.toMatchObject({ status: 400, code: 'WEAK_PASSWORD' });
  });
});

describe('enrollment', () => {
  it('enrollmentProfileUrl is the profile download path, without a request', () => {
    const fetch = vi.fn();
    expect(createApiClient({ baseUrl: '', fetch }).enrollmentProfileUrl()).toBe(
      '/api/v1/enrollment/profile',
    );
    expect(createApiClient({ baseUrl: 'http://api/', fetch }).enrollmentProfileUrl()).toBe(
      'http://api/api/v1/enrollment/profile',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('devSetDeviceStatus posts to the dev route', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      return new Response(null, { status: 204 });
    });
    await createApiClient({ baseUrl: 'http://api', fetch }).devSetDeviceStatus('ready');
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://api/api/v1/devices/dev/mine/ready');
    expect(init?.method).toBe('POST');
  });
});
