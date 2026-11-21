import { z } from 'zod';

export const QueueName = {
  system: 'system',
  ipa: 'ipa',
  billing: 'billing',
  certificates: 'certificates',
  signing: 'signing',
  maintenance: 'maintenance',
} as const;
export type QueueName = (typeof QueueName)[keyof typeof QueueName];

export type SystemPingResult = { pong: true; at: string };

/** Payload of `ipa:inspect`. */
export const ipaInspectJob = z.object({ uploadId: z.string().min(1) });
export type IpaInspectJob = z.infer<typeof ipaInspectJob>;

/** Payload of `signing:sign`: one of the `SigningJob` rows sharing the queue job. */
export const signingJob = z.object({ signingJobId: z.string().min(1) });
export type SigningJobData = z.infer<typeof signingJob>;

/** Removes signed copies of ended device files and old copies (worker `maintenance` queue). */
export const EVICT_SIGNED_JOB = 'maintenance:evictSigned';

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
