import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** `@Body(zodBody(schema))`: parses the body; a ZodError becomes 400 VALIDATION in the filter. */
export function zodBody<T>(schema: ZodType<T>): PipeTransform<unknown, T> {
  return { transform: (value: unknown): T => schema.parse(value) };
}
