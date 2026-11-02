import { expect, it } from 'vitest';
import { apiErrorSchema } from './errors.js';

it('accepts a known error', () => {
  expect(apiErrorSchema.parse({ code: 'NOT_FOUND', message: 'Не найдено' })).toEqual({
    code: 'NOT_FOUND',
    message: 'Не найдено',
  });
});

it('rejects an unknown code', () => {
  expect(apiErrorSchema.safeParse({ code: 'FOO', message: 'x' }).success).toBe(false);
});

it('rejects an empty message', () => {
  expect(apiErrorSchema.safeParse({ code: 'INTERNAL', message: '' }).success).toBe(false);
});
