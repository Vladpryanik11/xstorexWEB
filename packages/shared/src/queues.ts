export const QueueName = { system: 'system' } as const;

export type SystemPingResult = { pong: true; at: string };
