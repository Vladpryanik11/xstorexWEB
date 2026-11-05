import type { ZodType } from 'zod';
import type { PrismaClient } from './generated/prisma/client.js';

const warned = new Set<string>();

/**
 * Reads a setting and validates it. A missing row or a value that fails the schema yields
 * `fallback`; an invalid value is reported once per key (the value itself is not logged).
 */
export async function readSetting<T>(
  db: PrismaClient,
  key: string,
  schema: ZodType<T>,
  fallback: T,
): Promise<T> {
  const row = await db.setting.findUnique({ where: { key } });
  if (!row) return fallback;
  const parsed = schema.safeParse(row.value);
  if (parsed.success) return parsed.data;
  if (!warned.has(key)) {
    warned.add(key);
    console.warn(`Setting "${key}" is invalid, using the default`);
  }
  return fallback;
}
