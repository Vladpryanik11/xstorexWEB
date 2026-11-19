import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT ${url}`);
});
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (url: string) => redirect(url),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv('XSTORE_DEV_PAGES', '1');
  vi.stubEnv('API_INTERNAL_URL', 'http://api.test');
  vi.stubEnv('SITE_URL', 'http://site.test');
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  redirect.mockClear();
});

describe('settleFakePayment', () => {
  it('returns to the order the API names', async () => {
    fetchMock.mockResolvedValue(Response.json({ result: 'granted', orderId: 'ord_9' }));
    const { settleFakePayment } = await import('./actions');
    await expect(settleFakePayment('pay_1', 'pay')).rejects.toThrow('REDIRECT /get/ord_9');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/billing/dev/fake-payments/pay_1/pay');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ origin: 'http://site.test' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a failed call shows a message on the page instead of an error', async () => {
    fetchMock.mockResolvedValue(Response.json({ code: 'NOT_FOUND' }, { status: 404 }));
    const { settleFakePayment } = await import('./actions');
    await expect(settleFakePayment('pay_1', 'fail')).rejects.toThrow(
      'REDIRECT /dev/pay/pay_1?error=1',
    );
  });

  it('is unavailable without the flag', async () => {
    vi.stubEnv('XSTORE_DEV_PAGES', '');
    const { settleFakePayment } = await import('./actions');
    await expect(settleFakePayment('pay_1', 'pay')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
