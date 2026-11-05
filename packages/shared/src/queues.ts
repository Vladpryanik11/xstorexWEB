import { z } from 'zod';
import { emailSchema } from './auth.js';

export const QueueName = { system: 'system', ipa: 'ipa', notifications: 'notifications' } as const;
export type QueueName = (typeof QueueName)[keyof typeof QueueName];

export type SystemPingResult = { pong: true; at: string };

/** Payload of `ipa:inspect`. */
export const ipaInspectJob = z.object({ uploadId: z.string().min(1) });
export type IpaInspectJob = z.infer<typeof ipaInspectJob>;

export const notificationJob = z.discriminatedUnion('template', [
  z.object({
    template: z.literal('email-code'),
    to: emailSchema,
    vars: z.object({ code: z.string().regex(/^\d{6}$/) }),
  }),
]);
export type NotificationJob = z.infer<typeof notificationJob>;

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
