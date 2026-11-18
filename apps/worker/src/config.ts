import { tmpdir } from 'node:os';
import { z } from 'zod';

const envSchema = z.object({
  REDIS_URL: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
  /** Scratch space for downloaded IPAs; needs room for the largest upload (10 GiB). */
  TMP_DIR: z.string().min(1).optional(),
  S3_ENDPOINT: z.url({ protocol: /^https?$/ }),
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
  /** Only the fake provider's redirect links use it; the worker creates no payments. */
  SITE_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:3000'),
});

export type WorkerS3Config = {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucketPrefix: string;
};

export type WorkerPaymentConfig = {
  provider: 'fake' | 'platega';
  /** HMAC key of fake webhooks; set only with the fake provider. */
  fakeWebhookSecret: string | null;
  siteUrl: string;
};

export type WorkerConfig = {
  redisUrl: string;
  databaseUrl: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  concurrency: number;
  tmpDir: string;
  s3: WorkerS3Config;
  payment: WorkerPaymentConfig;
};

export function loadWorkerConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Invalid environment variables: ${names.join(', ')}`);
  }
  const e = parsed.data;
  const invalid = (name: string): Error => new Error(`Invalid environment variables: ${name}`);
  if (e.PAYMENT_PROVIDER === 'fake' && e.NODE_ENV === 'production') {
    throw invalid('PAYMENT_PROVIDER');
  }
  if (e.PAYMENT_PROVIDER === 'fake' && !e.FAKE_PAYMENT_WEBHOOK_SECRET) {
    throw invalid('FAKE_PAYMENT_WEBHOOK_SECRET');
  }
  return {
    redisUrl: e.REDIS_URL,
    databaseUrl: e.DATABASE_URL,
    logLevel: e.LOG_LEVEL,
    concurrency: e.WORKER_CONCURRENCY,
    tmpDir: e.TMP_DIR ?? tmpdir(),
    s3: {
      endpoint: e.S3_ENDPOINT.replace(/\/$/, ''),
      region: e.S3_REGION,
      accessKey: e.S3_ACCESS_KEY,
      secretKey: e.S3_SECRET_KEY,
      bucketPrefix: e.S3_BUCKET_PREFIX,
    },
    payment: {
      provider: e.PAYMENT_PROVIDER,
      fakeWebhookSecret:
        e.PAYMENT_PROVIDER === 'fake' ? (e.FAKE_PAYMENT_WEBHOOK_SECRET ?? null) : null,
      siteUrl: new URL(e.SITE_URL).origin,
    },
  };
}
