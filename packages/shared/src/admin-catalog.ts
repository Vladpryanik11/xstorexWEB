import { z } from 'zod';
import {
  type AppStatus,
  accessLevelSchema,
  appStatusSchema,
  type CollectionLayout,
  type CollectionSource,
  collectionLayoutSchema,
  collectionSourceSchema,
  type VersionStatus,
} from './catalog.js';
import { QueueName } from './queues.js';

/** Why an app cannot be published yet; an app publishes only with none. */
export const PublishBlocker = {
  NO_RIGHTS_BASIS: 'NO_RIGHTS_BASIS',
  NO_ICON: 'NO_ICON',
  NO_PUBLISHED_VERSION: 'NO_PUBLISHED_VERSION',
  NO_CATEGORY: 'NO_CATEGORY',
} as const;
export type PublishBlocker = (typeof PublishBlocker)[keyof typeof PublishBlocker];

/** Why a version cannot be published: FairPlay-encrypted IPAs cannot be signed (spec §4.4). */
export type VersionPublishBlocker = 'ENCRYPTED';

/** Slugs are lowercase Latin words joined by single dashes, at most 80 characters. */
export const slugSchema = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => text(max).nullable();

/** `PATCH /admin/apps/:id`: the admin types in the card by hand (no iTunes import). */
export const updateAppSchema = z
  .strictObject({
    name: text(200),
    subtitle: optionalText(200),
    description: optionalText(20_000),
    developer: optionalText(200),
    categoryId: z.string().min(1).nullable(),
    rightsBasis: optionalText(2000),
    accessLevel: accessLevelSchema,
    removedFromAppStore: z.boolean(),
    rating: z.number().min(0).max(5).nullable(),
    ratingCount: z.number().int().min(0).nullable(),
    languages: z.array(z.string().trim().min(1).max(40)).max(50),
    itunesId: z
      .string()
      .regex(/^\d{1,20}$/)
      .nullable(),
    slug: slugSchema,
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'empty patch');
export type UpdateApp = z.infer<typeof updateAppSchema>;

export const hideAppSchema = z.strictObject({ reason: text(500) });
export type HideApp = z.infer<typeof hideAppSchema>;

export const mediaKindSchema = z.enum(['icon', 'banner', 'screenshot']);
export type MediaKind = z.infer<typeof mediaKindSchema>;

/** Icons, banners and screenshots: PNG or JPEG up to 5 MB. */
export const MAX_MEDIA_BYTES = 5 * 1024 ** 2;
/** Most screenshots on one app card. */
export const MAX_SCREENSHOTS = 20;

export const mediaContentTypeSchema = z.enum(['image/png', 'image/jpeg']);
export type MediaContentType = z.infer<typeof mediaContentTypeSchema>;

export const presignMediaSchema = z.strictObject({
  contentType: mediaContentTypeSchema,
  sizeBytes: z.number().int().positive().max(MAX_MEDIA_BYTES),
});
export type PresignMedia = z.infer<typeof presignMediaSchema>;

/** A single presigned `PUT` into the media bucket; send `Content-Type` exactly as requested. */
export type MediaUploadTicket = { key: string; url: string };

export const commitMediaSchema = z.strictObject({ key: z.string().min(1).max(300) });
export type CommitMedia = z.infer<typeof commitMediaSchema>;

const unique = <T>(list: T[]) => new Set(list).size === list.length;

export const screenshotOrderSchema = z.strictObject({
  keys: z.array(z.string().min(1).max(300)).max(MAX_SCREENSHOTS).refine(unique, 'duplicate keys'),
});
export type ScreenshotOrder = z.infer<typeof screenshotOrderSchema>;

export const updateVersionSchema = z.strictObject({ changelog: optionalText(4000) });
export type UpdateVersion = z.infer<typeof updateVersionSchema>;

/** `PUT …/order`: every id exactly once, in the new order. */
export const idOrderSchema = z.strictObject({
  ids: z.array(z.string().min(1)).max(500).refine(unique, 'duplicate ids'),
});
export type IdOrder = z.infer<typeof idOrderSchema>;

/** Category icons are drawn for Xstore and referenced by name. */
const iconNameSchema = z
  .string()
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const createCategorySchema = z.strictObject({
  name: text(80),
  icon: iconNameSchema,
  slug: slugSchema.optional(),
});
export type CreateCategory = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'empty patch');
export type UpdateCategory = z.infer<typeof updateCategorySchema>;

export const createCollectionSchema = z.strictObject({
  title: text(120),
  layout: collectionLayoutSchema,
  source: collectionSourceSchema,
  slug: slugSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  onHome: z.boolean().optional(),
});
export type CreateCollection = z.infer<typeof createCollectionSchema>;

export const updateCollectionSchema = createCollectionSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'empty patch');
export type UpdateCollection = z.infer<typeof updateCollectionSchema>;

/** `PUT /admin/collections/:id/items`: position is the array index. */
export const collectionItemsSchema = z.strictObject({
  items: z
    .array(z.strictObject({ appId: z.string().min(1), pinned: z.boolean() }))
    .max(200)
    .refine((items) => unique(items.map((i) => i.appId)), 'duplicate apps'),
});
export type CollectionItems = z.infer<typeof collectionItemsSchema>;

export const adminAppsQuerySchema = z.object({
  status: appStatusSchema.optional(),
  q: z.string().trim().max(64).optional(),
  cursor: z.string().max(500).optional(),
});
export type AdminAppsQuery = z.infer<typeof adminAppsQuerySchema>;

export type AdminAppListItem = {
  id: string;
  slug: string;
  name: string;
  status: AppStatus;
  iconUrl: string | null;
  category: { id: string; name: string } | null;
  latestVersion: string | null;
  /** ISO 8601. */
  updatedAt: string;
};

export type AdminScreenshot = { key: string; url: string };

export type AdminAppDetail = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  developer: string | null;
  categoryId: string | null;
  rightsBasis: string | null;
  accessLevel: string;
  removedFromAppStore: boolean;
  status: AppStatus;
  hiddenReason: string | null;
  rating: number | null;
  ratingCount: number | null;
  languages: string[];
  itunesId: string | null;
  iconUrl: string | null;
  bannerUrl: string | null;
  screenshots: AdminScreenshot[];
  publishBlockers: PublishBlocker[];
  createdAt: string;
  updatedAt: string;
};

export type AdminVersion = {
  id: string;
  version: string;
  build: string;
  bundleId: string;
  minIos: string | null;
  sizeBytes: number;
  encrypted: boolean;
  status: VersionStatus;
  changelog: string | null;
  publishedAt: string | null;
  createdAt: string;
};

export type AdminCategory = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  sort: number;
  appCount: number;
};

export type AdminCollectionItem = {
  appId: string;
  slug: string;
  name: string;
  status: AppStatus;
  position: number;
  pinned: boolean;
};

export type AdminCollection = {
  id: string;
  slug: string;
  title: string;
  layout: CollectionLayout;
  source: CollectionSource;
  sort: number;
  limit: number;
  onHome: boolean;
  items: AdminCollectionItem[];
};

export const failedJobsQuerySchema = z.object({
  queue: z.enum(QueueName).optional(),
});

/** A job in BullMQ's failed set; job data is never exposed. */
export type FailedJob = {
  id: string;
  queue: string;
  name: string;
  /** At most 500 characters. */
  failedReason: string;
  attemptsMade: number;
  /** ISO 8601, `null` when BullMQ did not record it. */
  finishedOn: string | null;
};
