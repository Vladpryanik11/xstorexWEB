import { Injectable } from '@nestjs/common';
import { type Collection, type CollectionItem, Prisma, readSetting } from '@xstore/db';
import {
  type AppCard,
  type AppDetail,
  type BannerCard,
  type CategoryView,
  type CollectionView,
  ErrorCode,
  type HomeView,
  type Page,
} from '@xstore/shared';
import { z } from 'zod';
import { DomainError } from '../common/domain-error.js';
import { PrismaService } from '../infra/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { DEFAULT_TOP_RATED_MIN_VOTES, type RankInput, rankCollection } from './rank.js';

/** Apps per page in a category and in search. */
export const PAGE_SIZE = 24;
/** Most apps on a list page. */
export const LIST_LIMIT = 100;

const DAY_MS = 86_400_000;

/** Only published apps with at least one published version exist outside `/admin`. */
const VISIBLE = {
  status: 'published',
  versions: { some: { status: 'published' } },
} satisfies Prisma.AppWhereInput;

const CARD_SELECT = {
  id: true,
  slug: true,
  name: true,
  subtitle: true,
  iconKey: true,
  bannerKey: true,
  screenshotKeys: true,
  rating: true,
  ratingCount: true,
  category: { select: { slug: true, name: true } },
} satisfies Prisma.AppSelect;

type CardRow = Prisma.AppGetPayload<{ select: typeof CARD_SELECT }>;

const RANK_SELECT = {
  ...CARD_SELECT,
  versions: {
    where: { status: 'published' },
    orderBy: { publishedAt: 'desc' },
    take: 1,
    select: { publishedAt: true },
  },
} satisfies Prisma.AppSelect;

type RankRow = Prisma.AppGetPayload<{ select: typeof RANK_SELECT }>;

type CollectionWithItems = Collection & { items: CollectionItem[] };

export const searchQuerySchema = z.string().trim().min(2).max(64);

const categoryCursorSchema = z.object({ n: z.string(), i: z.string() });
const searchCursorSchema = z.object({ o: z.number().int().min(0).max(10_000) });

function encodeCursor(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeCursor<T>(raw: unknown, schema: z.ZodType<T>): T | undefined {
  if (raw === undefined || raw === '') return undefined;
  try {
    if (typeof raw !== 'string') throw new Error('cursor');
    return schema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
  } catch {
    throw new DomainError(ErrorCode.VALIDATION, 400);
  }
}

/** `%`, `_` and `\` in user input match themselves in LIKE. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function notFound(): DomainError {
  return new DomainError(ErrorCode.NOT_FOUND, 404);
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async home(): Promise<HomeView> {
    const [collections, categories] = await Promise.all([
      this.db.collection.findMany({
        where: { onHome: true },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
        include: { items: true },
      }),
      this.categories(),
    ]);
    const banner = collections.find((c) => c.layout === 'banner');
    const shelves = collections.filter((c) => c.layout !== 'banner');
    const ranked = await this.rankMany([...(banner ? [banner] : []), ...shelves], (c) => c.limit);

    const banners: BannerCard[] = [];
    if (banner) {
      for (const row of ranked.get(banner.id) ?? []) {
        if (row.bannerKey)
          banners.push({ ...this.card(row), imageUrl: this.storage.mediaUrl(row.bannerKey) });
      }
    }
    const views = shelves
      .map((c) => this.collectionView(c, ranked.get(c.id) ?? []))
      .filter((v) => v.items.length > 0);
    return { banners, collections: views, categories };
  }

  async app(slug: string): Promise<AppDetail> {
    const row = await this.db.app.findFirst({
      where: { slug, ...VISIBLE },
      select: {
        ...CARD_SELECT,
        description: true,
        developer: true,
        languages: true,
        screenshotKeys: true,
        removedFromAppStore: true,
        accessLevel: true,
        versions: {
          where: { status: 'published' },
          orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
          select: {
            version: true,
            build: true,
            sizeBytes: true,
            minIos: true,
            changelog: true,
            publishedAt: true,
          },
        },
      },
    });
    const latest = row?.versions[0];
    if (!row || !latest) throw notFound();
    return {
      ...this.card(row),
      description: row.description ?? undefined,
      developer: row.developer ?? undefined,
      languages: row.languages,
      sizeBytes: Number(latest.sizeBytes),
      version: latest.version,
      minIos: latest.minIos ?? undefined,
      screenshots: row.screenshotKeys.map((k) => this.storage.mediaUrl(k)),
      versions: row.versions.map((v) => ({
        version: v.version,
        build: v.build,
        publishedAt: (v.publishedAt ?? new Date(0)).toISOString(),
        changelog: v.changelog ?? undefined,
      })),
      removedFromAppStore: row.removedFromAppStore,
      accessLevel: row.accessLevel,
    };
  }

  async categories(): Promise<CategoryView[]> {
    const rows = await this.db.category.findMany({
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      select: { slug: true, name: true, icon: true },
    });
    return rows;
  }

  async category(slug: string, rawCursor?: unknown): Promise<Page<AppCard>> {
    const cursor = decodeCursor(rawCursor, categoryCursorSchema);
    const category = await this.db.category.findUnique({ where: { slug }, select: { id: true } });
    if (!category) throw notFound();
    const rows = await this.db.app.findMany({
      where: {
        ...VISIBLE,
        categoryId: category.id,
        ...(cursor && {
          OR: [{ name: { gt: cursor.n } }, { name: cursor.n, id: { gt: cursor.i } }],
        }),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: PAGE_SIZE + 1,
      select: CARD_SELECT,
    });
    const page = rows.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    return {
      items: page.map((r) => this.card(r)),
      nextCursor:
        rows.length > PAGE_SIZE && last ? encodeCursor({ n: last.name, i: last.id }) : null,
    };
  }

  async list(slug: string): Promise<CollectionView> {
    const collection = await this.db.collection.findUnique({
      where: { slug },
      include: { items: true },
    });
    if (!collection) throw notFound();
    const ranked = await this.rankMany([collection], () => LIST_LIMIT);
    return this.collectionView(collection, ranked.get(collection.id) ?? []);
  }

  async search(rawQuery: unknown, rawCursor?: unknown): Promise<Page<AppCard>> {
    const q = searchQuerySchema.parse(rawQuery).toLowerCase();
    const offset = decodeCursor(rawCursor, searchCursorSchema)?.o ?? 0;
    const contains = `%${escapeLike(q)}%`;
    const prefix = `${escapeLike(q)}%`;
    const hits = await this.db.$queryRaw<{ id: string }[]>`
      SELECT a."id"
      FROM "App" a
      WHERE a."status" = 'published'
        AND EXISTS (
          SELECT 1 FROM "AppVersion" v WHERE v."appId" = a."id" AND v."status" = 'published'
        )
        AND (
          lower(a."name") LIKE ${contains} ESCAPE '\\'
          OR lower(a."name") % ${q}
          OR lower(a."subtitle") LIKE ${contains} ESCAPE '\\'
          OR lower(a."developer") LIKE ${contains} ESCAPE '\\'
        )
      ORDER BY
        (lower(a."name") LIKE ${prefix} ESCAPE '\\') DESC,
        similarity(lower(a."name"), ${q}) DESC,
        a."name" ASC,
        a."id" ASC
      LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}
    `;
    const ids = hits.slice(0, PAGE_SIZE).map((h) => h.id);
    const rows = await this.db.app.findMany({ where: { id: { in: ids } }, select: CARD_SELECT });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return {
      items: ids.flatMap((id) => {
        const row = byId.get(id);
        return row ? [this.card(row)] : [];
      }),
      nextCursor: hits.length > PAGE_SIZE ? encodeCursor({ o: offset + PAGE_SIZE }) : null,
    };
  }

  /** Orders each collection's visible apps; download counts come from one grouped query. */
  private async rankMany(
    collections: CollectionWithItems[],
    limitOf: (c: CollectionWithItems) => number,
  ): Promise<Map<string, RankRow[]>> {
    const out = new Map<string, RankRow[]>();
    if (collections.length === 0) return out;
    const automatic = collections.some((c) => c.source !== 'manual');
    const itemIds = [...new Set(collections.flatMap((c) => c.items.map((i) => i.appId)))];
    const [rows, downloads, minVotes] = await Promise.all([
      this.db.app.findMany({
        where: automatic ? VISIBLE : { ...VISIBLE, id: { in: itemIds } },
        select: RANK_SELECT,
      }),
      automatic ? this.downloads(new Date()) : new Map<string, Downloads>(),
      collections.some((c) => c.source === 'top_rated')
        ? readSetting(
            this.db,
            'catalog.topRatedMinVotes',
            z.number().int().min(0),
            DEFAULT_TOP_RATED_MIN_VOTES,
          )
        : DEFAULT_TOP_RATED_MIN_VOTES,
    ]);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const inputs: RankInput[] = rows.map((r) => {
      const d = downloads.get(r.id);
      return {
        id: r.id,
        downloads30d: d?.d30 ?? 0,
        downloadsLast7d: d?.last7 ?? 0,
        downloadsPrev7d: d?.prev7 ?? 0,
        rating: r.rating,
        ratingCount: r.ratingCount,
        latestPublishedAt: r.versions[0]?.publishedAt ?? null,
      };
    });
    for (const c of collections) {
      const ids = rankCollection(c.source, inputs, c.items, limitOf(c), {
        topRatedMinVotes: minVotes,
      });
      out.set(
        c.id,
        ids.flatMap((id) => {
          const row = byId.get(id);
          return row ? [row] : [];
        }),
      );
    }
    return out;
  }

  private async downloads(now: Date): Promise<Map<string, Downloads>> {
    const d7 = new Date(now.getTime() - 7 * DAY_MS);
    const d14 = new Date(now.getTime() - 14 * DAY_MS);
    const d30 = new Date(now.getTime() - 30 * DAY_MS);
    const rows = await this.db.$queryRaw<({ appId: string } & Downloads)[]>`
      SELECT "appId",
        count(*)::int AS "d30",
        (count(*) FILTER (WHERE "createdAt" >= ${d7}))::int AS "last7",
        (count(*) FILTER (WHERE "createdAt" >= ${d14} AND "createdAt" < ${d7}))::int AS "prev7"
      FROM "InstallEvent"
      WHERE "createdAt" >= ${d30}
      GROUP BY "appId"
    `;
    return new Map(rows.map((r) => [r.appId, r]));
  }

  private collectionView(c: Collection, rows: CardRow[]): CollectionView {
    return { slug: c.slug, title: c.title, layout: c.layout, items: rows.map((r) => this.card(r)) };
  }

  private card(row: CardRow): AppCard {
    return {
      slug: row.slug,
      name: row.name,
      subtitle: row.subtitle ?? undefined,
      iconUrl: row.iconKey ? this.storage.mediaUrl(row.iconKey) : undefined,
      screenshotUrl: row.screenshotKeys[0]
        ? this.storage.mediaUrl(row.screenshotKeys[0])
        : undefined,
      rating: row.rating ?? undefined,
      ratingCount: row.ratingCount ?? undefined,
      category: row.category ?? undefined,
    };
  }
}

type Downloads = { d30: number; last7: number; prev7: number };
