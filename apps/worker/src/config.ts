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
});

export type WorkerS3Config = {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucketPrefix: string;
};

export type WorkerConfig = {
  redisUrl: string;
  databaseUrl: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  concurrency: number;
  tmpDir: string;
  s3: WorkerS3Config;
};

export function loadWorkerConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Invalid environment variables: ${names.join(', ')}`);
  }
  const e = parsed.data;
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
  };
}
