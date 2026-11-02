import { z } from 'zod';

export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.record(z.string(), z.enum(['up', 'down'])),
});

export type Health = z.infer<typeof healthSchema>;
