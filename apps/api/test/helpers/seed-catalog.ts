import type {
  AppStatus,
  CollectionLayout,
  CollectionSource,
  createPrismaClient,
  VersionStatus,
} from '@xstore/db';

type Db = ReturnType<typeof createPrismaClient>;

export type SeedVersion = {
  version: string;
  build?: string;
  status?: VersionStatus;
  publishedAt?: Date | null;
  sizeBytes?: bigint;
  minIos?: string;
  changelog?: string;
  encrypted?: boolean;
};

export type SeedApp = {
  slug: string;
  name: string;
  status?: AppStatus;
  subtitle?: string;
  description?: string;
  developer?: string;
  categoryId?: string;
  iconKey?: string;
  bannerKey?: string;
  screenshotKeys?: string[];
  languages?: string[];
  rating?: number;
  ratingCount?: number;
  removedFromAppStore?: boolean;
  accessLevel?: string;
  rightsBasis?: string;
  hiddenReason?: string;
  /** Defaults to one published version 1.0. */
  versions?: SeedVersion[];
};

let seq = 0;

/** Creates an app with its versions; each version gets a unique bundle id + build. */
export async function seedApp(db: Db, input: SeedApp): Promise<{ id: string; slug: string }> {
  const { versions = [{ version: '1.0' }], ...card } = input;
  const bundleId = `ru.xstorex.test.${input.slug.replace(/[^a-z0-9]/g, '')}`;
  return db.app.create({
    data: {
      status: 'published',
      ...card,
      versions: {
        create: versions.map((v) => {
          seq += 1;
          const status = v.status ?? 'published';
          return {
            version: v.version,
            build: v.build ?? String(seq),
            bundleId,
            sizeBytes: v.sizeBytes ?? 1024n,
            sha256: 'a'.repeat(64),
            ipaKey: `originals/${seq}.ipa`,
            encrypted: v.encrypted ?? false,
            minIos: v.minIos,
            changelog: v.changelog,
            status,
            publishedAt:
              v.publishedAt === undefined
                ? status === 'published'
                  ? new Date('2026-10-01T00:00:00Z')
                  : null
                : v.publishedAt,
          };
        }),
      },
    },
    select: { id: true, slug: true },
  });
}

export function seedCategory(
  db: Db,
  input: { slug: string; name: string; icon?: string; sort?: number },
): Promise<{ id: string }> {
  return db.category.create({
    data: { icon: input.icon ?? 'games', sort: input.sort ?? 0, ...input },
    select: { id: true },
  });
}

export async function seedCollection(
  db: Db,
  input: {
    slug: string;
    title: string;
    layout?: CollectionLayout;
    source?: CollectionSource;
    sort?: number;
    limit?: number;
    onHome?: boolean;
    items?: { appId: string; pinned?: boolean }[];
  },
): Promise<{ id: string }> {
  const { items = [], ...rest } = input;
  return db.collection.create({
    data: {
      layout: 'grid3',
      source: 'manual',
      sort: 0,
      ...rest,
      items: {
        create: items.map((i, position) => ({
          appId: i.appId,
          position,
          pinned: i.pinned ?? false,
        })),
      },
    },
    select: { id: true },
  });
}

/** `count` installs of an app, `daysAgo` days before `now`. */
export async function seedInstalls(
  db: Db,
  appId: string,
  count: number,
  daysAgo: number,
  now = new Date(),
): Promise<void> {
  const createdAt = new Date(now.getTime() - daysAgo * 86_400_000);
  await db.installEvent.createMany({
    data: Array.from({ length: count }, (_, i) => ({ appId, deviceId: `dev-${i}`, createdAt })),
  });
}
