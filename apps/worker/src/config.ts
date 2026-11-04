import { z } from 'zod';

const envSchema = z.object({
  REDIS_URL: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
});

export type WorkerConfig = {
  redisUrl: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  concurrency: number;
};

export function loadWorkerConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Invalid environment variables: ${names.join(', ')}`);
  }
  const e = parsed.data;
  return { redisUrl: e.REDIS_URL, logLevel: e.LOG_LEVEL, concurrency: e.WORKER_CONCURRENCY };
}
