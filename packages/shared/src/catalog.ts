import { z } from 'zod';

/** `free` or `addon:<Plan.code>` (spec §5). */
export const accessLevelSchema = z.union([
  z.literal('free'),
  z.string().regex(/^addon:[a-z0-9-]{1,40}$/),
]);
export type AccessLevel = z.infer<typeof accessLevelSchema>;

export const appStatusSchema = z.enum(['draft', 'published', 'hidden']);
export type AppStatus = z.infer<typeof appStatusSchema>;

export const versionStatusSchema = z.enum(['draft', 'published', 'rejected']);
export type VersionStatus = z.infer<typeof versionStatusSchema>;

export const collectionLayoutSchema = z.enum(['grid3', 'icons', 'screenshots', 'banner']);
export type CollectionLayout = z.infer<typeof collectionLayoutSchema>;

export const collectionSourceSchema = z.enum([
  'manual',
  'top_downloads',
  'trending',
  'top_rated',
  'recently_updated',
]);
export type CollectionSource = z.infer<typeof collectionSourceSchema>;

export const categoryRefSchema = z.object({ slug: z.string(), name: z.string() });
export type CategoryRef = z.infer<typeof categoryRefSchema>;

export const categoryViewSchema = categoryRefSchema.extend({ icon: z.string() });
export type CategoryView = z.infer<typeof categoryViewSchema>;

export const appCardSchema = z.object({
  slug: z.string(),
  name: z.string(),
  subtitle: z.string().optional(),
  iconUrl: z.string().optional(),
  rating: z.number().optional(),
  ratingCount: z.number().int().optional(),
  category: categoryRefSchema.optional(),
});
export type AppCard = z.infer<typeof appCardSchema>;

export const versionViewSchema = z.object({
  version: z.string(),
  build: z.string(),
  /** ISO 8601. */
  publishedAt: z.string(),
  changelog: z.string().optional(),
});
export type VersionView = z.infer<typeof versionViewSchema>;

export const appDetailSchema = appCardSchema.extend({
  description: z.string().optional(),
  developer: z.string().optional(),
  languages: z.array(z.string()),
  sizeBytes: z.number().int().nonnegative(),
  version: z.string(),
  minIos: z.string().optional(),
  screenshots: z.array(z.string()),
  versions: z.array(versionViewSchema),
  removedFromAppStore: z.boolean(),
  accessLevel: accessLevelSchema,
});
export type AppDetail = z.infer<typeof appDetailSchema>;

/** An app in the hero carousel (collection with layout `banner`). */
export const bannerCardSchema = appCardSchema.extend({ imageUrl: z.string() });
export type BannerCard = z.infer<typeof bannerCardSchema>;

export const collectionViewSchema = z.object({
  slug: z.string(),
  title: z.string(),
  layout: collectionLayoutSchema,
  items: z.array(appCardSchema),
});
export type CollectionView = z.infer<typeof collectionViewSchema>;

export const homeViewSchema = z.object({
  banners: z.array(bannerCardSchema),
  collections: z.array(collectionViewSchema),
  categories: z.array(categoryViewSchema),
});
export type HomeView = z.infer<typeof homeViewSchema>;

export type Page<T> = { items: T[]; nextCursor: string | null };

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}
