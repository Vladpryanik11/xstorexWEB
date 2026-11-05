import { expect, it } from 'vitest';
import { defaultJobOptions, ipaInspectJob, QueueName } from './queues.js';

it('names the M1 queues', () => {
  expect(QueueName).toEqual({ system: 'system', ipa: 'ipa' });
});

it('validates job payloads', () => {
  expect(ipaInspectJob.parse({ uploadId: 'u1' })).toEqual({ uploadId: 'u1' });
  expect(ipaInspectJob.safeParse({}).success).toBe(false);
  expect(ipaInspectJob.safeParse({ uploadId: '' }).success).toBe(false);
});

it('uses the job defaults of the M1 plan', () => {
  expect(defaultJobOptions).toEqual({
    attempts: 5,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: 1000,
    removeOnFail: false,
  });
});
