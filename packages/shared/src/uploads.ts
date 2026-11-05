import { z } from 'zod';

export const createUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
});
export type CreateUpload = z.infer<typeof createUploadSchema>;

export const uploadStatusSchema = z.enum([
  'uploading',
  'uploaded',
  'inspecting',
  'ready',
  'rejected',
  'expired',
]);
export type UploadStatus = z.infer<typeof uploadStatusSchema>;

export const uploadViewSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  sizeBytes: z.number().int(),
  partSize: z.number().int(),
  status: uploadStatusSchema,
  rejectCode: z.string().optional(),
  inspect: z.unknown().optional(),
});
export type UploadView = z.infer<typeof uploadViewSchema>;

/** At most this many part URLs are presigned per request. */
export const MAX_PART_URLS_PER_CALL = 20;

const partNumber = z.number().int().min(1).max(10_000);

export const presignPartsSchema = z.object({
  partNumbers: z
    .array(partNumber)
    .min(1)
    .max(MAX_PART_URLS_PER_CALL)
    .refine((list) => new Set(list).size === list.length, 'duplicate part numbers'),
});
export type PresignParts = z.infer<typeof presignPartsSchema>;
export type PresignedParts = { urls: { partNumber: number; url: string }[] };

export type UploadedPart = { partNumber: number; etag: string; size: number };
export type UploadedParts = { parts: UploadedPart[] };

export const completeUploadSchema = z.object({
  parts: z
    .array(z.object({ partNumber, etag: z.string().min(1).max(128) }))
    .min(1)
    .max(10_000),
});
export type CompleteUpload = z.infer<typeof completeUploadSchema>;

/** Job payload of `ipa:inspect`. */
export type IpaInspectJob = { uploadId: string };
