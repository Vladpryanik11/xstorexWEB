import { z } from 'zod';

export const catalogPublicationStatusSchema = z.enum(['draft', 'published', 'hidden']);

export const catalogSlugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Недопустимый адрес');

export const catalogPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const catalogSearchSchema = catalogPaginationSchema.extend({
  q: z.string().trim().min(1).max(100),
});

export const catalogAccessLevelSchema = z
  .string()
  .regex(/^(?:free|addon:[a-z0-9][a-z0-9_-]{0,63})$/, 'Недопустимый уровень доступа');

export const catalogAppInputSchema = z
  .object({
    slug: catalogSlugSchema,
    name: z.string().trim().min(1).max(140),
    subtitle: z.string().trim().max(300).optional(),
    description: z.string().trim().max(20_000).optional(),
    developer: z.string().trim().min(1).max(200),
    categoryId: z.string().trim().min(1),
    rightsBasis: z.string().trim().max(2_000).default(''),
    accessLevel: catalogAccessLevelSchema.default('free'),
    removedFromAppStore: z.boolean().default(false),
    status: catalogPublicationStatusSchema.default('draft'),
  })
  .superRefine((value, ctx) => {
    if (value.status === 'published' && value.rightsBasis.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['rightsBasis'],
        message: 'Для публикации укажите основание для распространения',
      });
    }
  });

const maxIpaBytes = BigInt(10) * BigInt(1024) ** BigInt(3);

export const catalogVersionInputSchema = z
  .object({
    version: z.string().trim().min(1).max(64),
    build: z.string().trim().min(1).max(64),
    bundleId: z
      .string()
      .min(3)
      .max(255)
      .regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/, 'Недопустимый Bundle ID'),
    minIos: z
      .string()
      .regex(/^\d+(?:\.\d+){0,2}$/)
      .optional(),
    sizeBytes: z.bigint().positive().max(maxIpaBytes),
    sha256: z.string().regex(/^[a-f0-9]{64}$/, 'Недопустимая контрольная сумма'),
    ipaKey: z.string().regex(/^catalog\/[a-zA-Z0-9_/-]+\.ipa$/, 'Недопустимый ключ IPA'),
    encrypted: z.boolean().default(false),
    status: catalogPublicationStatusSchema.default('draft'),
  })
  .superRefine((value, ctx) => {
    if (value.status === 'published' && value.encrypted) {
      ctx.addIssue({
        code: 'custom',
        path: ['encrypted'],
        message: 'Невозможно опубликовать зашифрованный IPA',
      });
    }
  });

export type CatalogPagination = z.infer<typeof catalogPaginationSchema>;
export type CatalogSearch = z.infer<typeof catalogSearchSchema>;
export type CatalogAppInput = z.infer<typeof catalogAppInputSchema>;
export type CatalogVersionInput = z.infer<typeof catalogVersionInputSchema>;
