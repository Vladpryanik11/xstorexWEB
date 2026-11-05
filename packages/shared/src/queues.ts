import { z } from 'zod';

export const QueueName = { system: 'system', ipa: 'ipa', catalog: 'catalog' } as const;
export type QueueName = (typeof QueueName)[keyof typeof QueueName];

export type SystemPingResult = { pong: true; at: string };

/** Payload of `ipa:inspect`. */
export const ipaInspectJob = z.object({ uploadId: z.string().min(1) });
export type IpaInspectJob = z.infer<typeof ipaInspectJob>;

/** Payload of `catalog:importMetadata`. */
export const catalogImportJob = z.object({ appId: z.string().min(1) });
export type CatalogImportJob = z.infer<typeof catalogImportJob>;

/** Defaults for every job (M1 plan, Global Constraints); structurally a BullMQ `JobsOptions`. */
export const defaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: 1000,
  removeOnFail: false,
} as const satisfies {
  attempts: number;
  backoff: { type: 'exponential' | 'fixed'; delay: number };
  removeOnComplete: number;
  removeOnFail: boolean;
};
