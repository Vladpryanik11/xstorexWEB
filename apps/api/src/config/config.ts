import { type Keyring, loadKeyring } from '@xstore/secrets';
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
  /** Master key version and keys (`MASTER_KEY_V<n>`, base64 of 32 bytes); never logged. */
  MASTER_KEY_CURRENT: z.string().optional(),
  PAYMENT_PROVIDER: z.enum(['fake', 'platega']),
  FAKE_PAYMENT_WEBHOOK_SECRET: z.string().min(16).optional(),
  XSTORE_DEV_PAGES: z.string().optional(),
  /** smtp(s)://user:password@host:port; may hold a password, never logged. */
  SMTP_URL: z
    .string()
    .regex(/^smtps?:\/\/[^\s]+$/)
    .optional(),
  MAIL_FROM: z.string().min(3).optional(),
  /** PEM certificate (full chain allowed) and private key that sign the connection profile. */
  ENROLL_CERT_PATH: z.string().min(1).optional(),
  ENROLL_KEY_PATH: z.string().min(1).optional(),
  /** Extra trusted root for answers of test devices; refused in production. */
  ENROLL_TEST_ANCHOR_PATH: z.string().min(1).optional(),
});

/** Outside production the letters go to the local Mailpit (`pnpm infra:up`). */
const DEV_SMTP_URL = 'smtp://127.0.0.1:1025';
const DEV_MAIL_FROM = 'Xstore <noreply@xstorex.ru>';

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

export type MailConfig = {
  /** Contains the SMTP password when there is one: never log it. */
  smtpUrl: string;
  from: string;
};

export type EnrollmentConfig = {
  /** Profile signer files; null until configured (the profile cannot be served then). */
  signer: { certPath: string; keyPath: string } | null;
  /** PEM root trusted besides Apple Root CA; never set in production. */
  testAnchorPath: string | null;
};

export type AppConfig = {
  databaseUrl: string;
  redisUrl: string;
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  siteUrl: string;
  s3: S3Config;
  payment: PaymentConfig;
  mail: MailConfig;
  enrollment: EnrollmentConfig;
  /** `XSTORE_DEV_PAGES=1`: development-only routes such as the fake payment buttons. */
  devPages: boolean;
  /** Encrypts supplier certificates; `null` outside production when no master key is set. */
  keyring: Keyring | null;
};

const invalid = (names: string[]): Error =>
  new Error(`Invalid environment variables: ${names.join(', ')}`);

/** The keyring when `MASTER_KEY_CURRENT` is set; a bad key names only the variable. */
export function keyringFrom(env: NodeJS.ProcessEnv): Keyring | null {
  if (!env.MASTER_KEY_CURRENT) return null;
  try {
    return loadKeyring(env);
  } catch (err) {
    const variable = /MASTER_KEY_\w+/.exec(err instanceof Error ? err.message : '')?.[0];
    throw invalid([variable ?? 'MASTER_KEY_CURRENT']);
  }
}

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
  if (e.NODE_ENV === 'production') {
    const missing = (['SMTP_URL', 'MAIL_FROM'] as const).filter((name) => !e[name]);
    if (missing.length > 0) throw invalid([...missing]);
    if (e.ENROLL_TEST_ANCHOR_PATH) throw invalid(['ENROLL_TEST_ANCHOR_PATH']);
    if (!e.MASTER_KEY_CURRENT) throw invalid(['MASTER_KEY_CURRENT']);
  }
  if (Boolean(e.ENROLL_CERT_PATH) !== Boolean(e.ENROLL_KEY_PATH)) {
    throw invalid([e.ENROLL_CERT_PATH ? 'ENROLL_KEY_PATH' : 'ENROLL_CERT_PATH']);
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
    mail: { smtpUrl: e.SMTP_URL ?? DEV_SMTP_URL, from: e.MAIL_FROM ?? DEV_MAIL_FROM },
    enrollment: {
      signer:
        e.ENROLL_CERT_PATH && e.ENROLL_KEY_PATH
          ? { certPath: e.ENROLL_CERT_PATH, keyPath: e.ENROLL_KEY_PATH }
          : null,
      testAnchorPath: e.ENROLL_TEST_ANCHOR_PATH ?? null,
    },
    devPages: e.XSTORE_DEV_PAGES === '1',
    keyring: keyringFrom(env),
  };
}
