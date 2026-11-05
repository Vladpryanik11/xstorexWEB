export const QueueName = { system: 'system', ipa: 'ipa', catalog: 'catalog' } as const;
export type QueueName = (typeof QueueName)[keyof typeof QueueName];

export type SystemPingResult = { pong: true; at: string };
