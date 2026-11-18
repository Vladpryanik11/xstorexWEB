import { z } from 'zod';

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
  S3_ENDPOINT: origin,
  S3_PUBLIC_URL: origin,
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET_PREFIX: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,40}$/)
    .default('xstore-'),
  NODE_ENV: z.string().optional(),
  PAYMENT_PROVIDER: z.enum(['fake', 'platega']),
  FAKE_PAYMENT_WEBHOOK_SECRET: z.string().min(16).optional(),
  XSTORE_DEV_PAGES: z.string().optional(),
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

export type PaymentConfig = {
  /** `fake` is for development and tests only; the process refuses it in production. */
  provider: 'fake' | 'platega';
  /** HMAC key of fake webhooks; set only with the fake provider. */
  fakeWebhookSecret: string | null;
};

export type AppConfig = {
  databaseUrl: string;
  redisUrl: string;
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  siteUrl: string;
  s3: S3Config;
  payment: PaymentConfig;
  /** `XSTORE_DEV_PAGES=1`: development-only routes such as the fake payment buttons. */
  devPages: boolean;
};

const invalid = (names: string[]): Error =>
  new Error(`Invalid environment variables: ${names.join(', ')}`);

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw invalid([...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))]);
  }
  const e = parsed.data;
  if (e.PAYMENT_PROVIDER === 'fake' && e.NODE_ENV === 'production') {
    throw invalid(['PAYMENT_PROVIDER']);
  }
  if (e.PAYMENT_PROVIDER === 'fake' && !e.FAKE_PAYMENT_WEBHOOK_SECRET) {
    throw invalid(['FAKE_PAYMENT_WEBHOOK_SECRET']);
  }
  return {
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    port: e.API_PORT,
    logLevel: e.LOG_LEVEL,
    siteUrl: e.SITE_URL,
    s3: {
      endpoint: e.S3_ENDPOINT,
      publicUrl: e.S3_PUBLIC_URL,
      region: e.S3_REGION,
      accessKey: e.S3_ACCESS_KEY,
      secretKey: e.S3_SECRET_KEY,
      bucketPrefix: e.S3_BUCKET_PREFIX,
    },
    payment: {
      provider: e.PAYMENT_PROVIDER,
      fakeWebhookSecret:
        e.PAYMENT_PROVIDER === 'fake' ? (e.FAKE_PAYMENT_WEBHOOK_SECRET ?? null) : null,
    },
    devPages: e.XSTORE_DEV_PAGES === '1',
  };
}
