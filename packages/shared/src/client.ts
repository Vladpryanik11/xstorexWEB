import type { z } from 'zod';
import {
  type CustomerLogin,
  type EmailCodeRequest,
  type EmailCodeVerify,
  type HandoffRedeem,
  type HandoffResponse,
  handoffResponseSchema,
  type SetPassword,
} from './auth.js';
import {
  type AccessResponse,
  accessResponseSchema,
  type CheckoutRequest,
  type CheckoutResponse,
  checkoutResponseSchema,
  type OrderView,
  orderViewSchema,
  type PlanView,
  planViewSchema,
} from './billing.js';
import {
  type AppCard,
  type AppDetail,
  appCardSchema,
  appDetailSchema,
  type CategoryView,
  type CollectionView,
  categoryViewSchema,
  collectionViewSchema,
  type HomeView,
  homeViewSchema,
  type Page,
  pageSchema,
} from './catalog.js';
import { apiErrorSchema, ErrorCode, errorMessages } from './errors.js';
import {
  type ChosenApp,
  chosenAppSchema,
  type InstallJobView,
  type InstallLink,
  type InstallRequest,
  installJobViewSchema,
  installLinkSchema,
} from './install.js';

export class ApiClientError extends Error {
  override readonly name = 'ApiClientError';

  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    /** Machine-readable reasons, e.g. the app `REPLACES_APP` would replace. */
    readonly details: string[] = [],
  ) {
    super(message);
  }
}

export type ApiClientOptions = {
  /** API origin, e.g. `http://localhost:3001`; `/api/v1` is added here. */
  baseUrl: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
};

type Query = Record<string, string | undefined>;

const appPage = pageSchema(appCardSchema);
const categoryList = categoryViewSchema.array();

/** Typed client for the public API. Each method validates the response with its schema. */
export function createApiClient(opts: ApiClientOptions) {
  const base = `${opts.baseUrl.replace(/\/+$/, '')}/api/v1`;
  const doFetch = opts.fetch ?? fetch;

  async function parse<T extends z.ZodType>(res: Response, schema: T): Promise<z.infer<T>> {
    const body: unknown = await res.json().catch(() => undefined);
    if (!res.ok) {
      const err = apiErrorSchema.safeParse(body);
      if (err.success) {
        throw new ApiClientError(res.status, err.data.code, err.data.message, err.data.details);
      }
      throw new ApiClientError(res.status, ErrorCode.INTERNAL, errorMessages.INTERNAL);
    }
    return schema.parse(body) as z.infer<T>;
  }

  async function get<T extends z.ZodType>(path: string, schema: T, query: Query = {}) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined) params.set(k, v);
    const qs = params.size > 0 ? `?${params}` : '';
    const res = await doFetch(`${base}${path}${qs}`, {
      headers: { accept: 'application/json', ...opts.headers },
    });
    return parse(res, schema);
  }

  /** POST that answers 204: resolves with nothing, throws `ApiClientError` like the rest. */
  async function send(path: string, body: unknown): Promise<void> {
    const res = await doFetch(`${base}${path}`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', ...opts.headers },
      body: JSON.stringify(body),
    });
    if (res.ok) return;
    await parse(res, apiErrorSchema);
  }

  async function post<T extends z.ZodType>(path: string, schema: T, body: unknown) {
    const res = await doFetch(`${base}${path}`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', ...opts.headers },
      body: JSON.stringify(body),
    });
    return parse(res, schema);
  }

  const seg = encodeURIComponent;

  return {
    home: (): Promise<HomeView> => get('/catalog/home', homeViewSchema),
    app: (slug: string): Promise<AppDetail> => get(`/catalog/apps/${seg(slug)}`, appDetailSchema),
    categories: (): Promise<CategoryView[]> => get('/catalog/categories', categoryList),
    category: (slug: string, cursor?: string): Promise<Page<AppCard>> =>
      get(`/catalog/categories/${seg(slug)}`, appPage, { cursor }),
    section: (slug: string, cursor?: string): Promise<Page<AppCard>> =>
      get(`/catalog/sections/${seg(slug)}`, appPage, { cursor }),
    list: (slug: string): Promise<CollectionView> =>
      get(`/catalog/lists/${seg(slug)}`, collectionViewSchema),
    search: (q: string, cursor?: string): Promise<Page<AppCard>> =>
      get('/catalog/search', appPage, { q, cursor }),
    getPlan: (): Promise<PlanView> => get('/billing/plan', planViewSchema),
    checkout: (body: CheckoutRequest): Promise<CheckoutResponse> =>
      post('/billing/checkout', checkoutResponseSchema, body),
    getOrder: (id: string): Promise<OrderView> =>
      get(`/billing/orders/${seg(id)}`, orderViewSchema),
    getAccess: (): Promise<AccessResponse> => get('/access', accessResponseSchema),
    /** Buyer sign-in: each sets or clears the session cookie through `Set-Cookie`. */
    login: (body: CustomerLogin): Promise<void> => send('/auth/login', body),
    requestCode: (body: EmailCodeRequest): Promise<void> => send('/auth/code/request', body),
    verifyCode: (body: EmailCodeVerify): Promise<void> => send('/auth/code/verify', body),
    setPassword: (body: SetPassword): Promise<void> => send('/auth/password', body),
    logout: (): Promise<void> => send('/auth/logout', {}),
    /** Spec v2 §4 step 2a: a one-time link that signs this buyer in from Safari. */
    issueHandoff: (): Promise<HandoffResponse> => post('/auth/handoff', handoffResponseSchema, {}),
    redeemHandoff: (body: HandoffRedeem): Promise<void> => send('/auth/handoff/redeem', body),
    /** Н4: ask for a signed copy for the buyer's device, follow it, take a one-time link. */
    requestInstall: (slug: string, body: InstallRequest = {}): Promise<InstallJobView> =>
      post(`/install/apps/${seg(slug)}`, installJobViewSchema, body),
    installJob: (id: string): Promise<InstallJobView> =>
      get(`/install/jobs/${seg(id)}`, installJobViewSchema),
    installLink: (id: string): Promise<InstallLink> =>
      post(`/install/jobs/${seg(id)}/token`, installLinkSchema, {}),
    chosenApp: (): Promise<ChosenApp> => get('/install/chosen', chosenAppSchema),
    /** Link the browser opens to download the connection file; not a fetch. */
    enrollmentProfileUrl: (): string => `${base}/enrollment/profile`,
    /** Development only (`XSTORE_DEV_PAGES=1`): marks the buyer's device ready or pending. */
    devSetDeviceStatus: (status: 'ready' | 'pending'): Promise<void> =>
      send(`/devices/dev/mine/${status}`, {}),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
