import { tmpdir } from 'node:os';
import { type Keyring, loadKeyring } from '@xstore/secrets';
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
  /** Master key version and keys (`MASTER_KEY_V<n>`); never logged. */
  MASTER_KEY_CURRENT: z.string().optional(),
  PAYMENT_PROVIDER: z.enum(['fake', 'platega']),
  FAKE_PAYMENT_WEBHOOK_SECRET: z.string().min(16).optional(),
  /** The site address in letters and the fake provider's redirect links. */
  SITE_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:3000'),
  /** smtp(s)://user:password@host:port; may hold a password, never logged. */
  SMTP_URL: z
    .string()
    .regex(/^smtps?:\/\/[^\s]+$/)
    .optional(),
  MAIL_FROM: z.string().min(3).optional(),
  /** Н4 signing: the zsign binary and its limits (spec Н4 §5). */
  ZSIGN_BIN: z.string().min(1).default('/usr/local/bin/zsign'),
  SIGNING_TIMEOUT_MS: z.coerce.number().int().min(1000).default(600_000),
  SIGNING_MEMORY_MB: z.coerce.number().int().min(128).default(2048),
  SIGNING_CPU_SEC: z.coerce.number().int().min(10).default(900),
  SIGNING_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
});

/** Outside production the letters go to the local Mailpit (`pnpm infra:up`). */
const DEV_SMTP_URL = 'smtp://127.0.0.1:1025';
const DEV_MAIL_FROM = 'Xstore <noreply@xstorex.ru>';

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

export type WorkerMailConfig = {
  /** Contains the SMTP password when there is one: never log it. */
  smtpUrl: string;
  from: string;
};

export type WorkerSigningConfig = {
  zsignBin: string;
  timeoutMs: number;
  memoryMb: number;
  cpuSec: number;
  concurrency: number;
};

export type WorkerConfig = {
  redisUrl: string;
  databaseUrl: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  concurrency: number;
  tmpDir: string;
  s3: WorkerS3Config;
  payment: WorkerPaymentConfig;
  mail: WorkerMailConfig;
  signing: WorkerSigningConfig;
  /** Decrypts supplier certificates; `null` outside production when no master key is set. */
  keyring: Keyring | null;
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
  if (e.NODE_ENV === 'production') {
    const missing = (['SMTP_URL', 'MAIL_FROM'] as const).filter((name) => !e[name]);
    if (missing.length > 0) throw invalid(missing.join(', '));
    if (!e.MASTER_KEY_CURRENT) throw invalid('MASTER_KEY_CURRENT');
  }
  let keyring: Keyring | null = null;
  if (e.MASTER_KEY_CURRENT) {
    try {
      keyring = loadKeyring(env);
    } catch (err) {
      throw invalid(
        /MASTER_KEY_\w+/.exec(err instanceof Error ? err.message : '')?.[0] ?? 'MASTER_KEY_CURRENT',
      );
    }
  }
  return {
    keyring,
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
    mail: { smtpUrl: e.SMTP_URL ?? DEV_SMTP_URL, from: e.MAIL_FROM ?? DEV_MAIL_FROM },
    signing: {
      zsignBin: e.ZSIGN_BIN,
      timeoutMs: e.SIGNING_TIMEOUT_MS,
      memoryMb: e.SIGNING_MEMORY_MB,
      cpuSec: e.SIGNING_CPU_SEC,
      concurrency: e.SIGNING_CONCURRENCY,
    },
  };
}
