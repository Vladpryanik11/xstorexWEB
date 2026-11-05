import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/** An http(s) origin without a trailing slash, path, query or fragment. */
const origin = z
  .url({ protocol: /^https?$/ })
  .refine((value) => new URL(value).origin === value.replace(/\/$/, ''), 'must be an origin')
  .transform((value) => value.replace(/\/$/, ''));

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SITE_URL: z.url(),
  ENROLL_CERT_PATH: z.string().min(1).optional(),
  ENROLL_KEY_PATH: z.string().min(1).optional(),
  ENROLL_TRUST_ANCHORS_PATH: z.string().min(1).optional(),
  S3_ENDPOINT: origin,
  S3_PUBLIC_URL: origin,
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET_PREFIX: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,40}$/)
    .default('xstore-'),
});

export type S3Config = {
  /** Server-side endpoint (MinIO inside the network). */
  endpoint: string;
  /** Public origin of the same storage: presigned URLs and media links point here. */
  publicUrl: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucketPrefix: string;
};

export type AppConfig = {
  databaseUrl: string;
  redisUrl: string;
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  siteUrl: string;
  enrollment: { certPath: string; keyPath: string; anchorsPath: string };
  s3: S3Config;
};

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Invalid environment variables: ${names.join(', ')}`);
  }
  const e = parsed.data;
  return {
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    port: e.API_PORT,
    logLevel: e.LOG_LEVEL,
    siteUrl: e.SITE_URL,
    enrollment: {
      certPath: resolve(repoRoot, e.ENROLL_CERT_PATH ?? 'infra/dev-certs/enroll.crt'),
      keyPath: resolve(repoRoot, e.ENROLL_KEY_PATH ?? 'infra/dev-certs/enroll.key'),
      anchorsPath: resolve(
        repoRoot,
        e.ENROLL_TRUST_ANCHORS_PATH ?? 'apps/api/certs/AppleIPhoneDeviceCA.pem',
      ),
    },
    s3: {
      endpoint: e.S3_ENDPOINT,
      publicUrl: e.S3_PUBLIC_URL,
      region: e.S3_REGION,
      accessKey: e.S3_ACCESS_KEY,
      secretKey: e.S3_SECRET_KEY,
      bucketPrefix: e.S3_BUCKET_PREFIX,
    },
  };
}
