import type { z } from 'zod';
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

export class ApiClientError extends Error {
  override readonly name = 'ApiClientError';

  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
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

  async function get<T extends z.ZodType>(path: string, schema: T, query: Query = {}) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined) params.set(k, v);
    const qs = params.size > 0 ? `?${params}` : '';
    const res = await doFetch(`${base}${path}${qs}`, {
      headers: { accept: 'application/json', ...opts.headers },
    });
    const body: unknown = await res.json().catch(() => undefined);
    if (!res.ok) {
      const err = apiErrorSchema.safeParse(body);
      if (err.success) throw new ApiClientError(res.status, err.data.code, err.data.message);
      throw new ApiClientError(res.status, ErrorCode.INTERNAL, errorMessages.INTERNAL);
    }
    return schema.parse(body) as z.infer<T>;
  }

  const seg = encodeURIComponent;

  return {
    home: (): Promise<HomeView> => get('/catalog/home', homeViewSchema),
    app: (slug: string): Promise<AppDetail> => get(`/catalog/apps/${seg(slug)}`, appDetailSchema),
    categories: (): Promise<CategoryView[]> => get('/catalog/categories', categoryList),
    category: (slug: string, cursor?: string): Promise<Page<AppCard>> =>
      get(`/catalog/categories/${seg(slug)}`, appPage, { cursor }),
    list: (slug: string): Promise<CollectionView> =>
      get(`/catalog/lists/${seg(slug)}`, collectionViewSchema),
    search: (q: string, cursor?: string): Promise<Page<AppCard>> =>
      get('/catalog/search', appPage, { q, cursor }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
