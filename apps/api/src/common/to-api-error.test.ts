import { NotFoundException } from '@nestjs/common';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { toApiError } from './to-api-error.js';

it('maps NotFoundException', () => {
  expect(toApiError(new NotFoundException())).toEqual({
    status: 404,
    body: { code: 'NOT_FOUND', message: 'Не найдено' },
  });
});

it('maps ZodError to 400 VALIDATION', () => {
  const err = z.object({ a: z.string() }).safeParse({}).error;
  expect(toApiError(err)).toMatchObject({ status: 400, body: { code: 'VALIDATION' } });
});

it('hides unknown errors', () => {
  expect(toApiError(new Error('password=secret'))).toEqual({
    status: 500,
    body: { code: 'INTERNAL', message: 'Внутренняя ошибка сервера' },
  });
});
