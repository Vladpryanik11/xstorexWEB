import { expect, it } from 'vitest';
import { apiErrorSchema, ErrorCode, errorMessages, signinMessages } from './errors.js';

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

it('has a Russian message for every code', () => {
  for (const code of Object.values(ErrorCode)) {
    expect(errorMessages[code]).toMatch(/[А-Яа-яЁё]/);
  }
  expect(errorMessages.INVALID_CREDENTIALS).toBe('Неверная почта или пароль');
  expect(errorMessages.CODE_INVALID).toBe('Неверный или устаревший код');
  expect(errorMessages.HANDOFF_INVALID).toBe(
    'Ссылка для входа устарела. Войдите по коду из письма',
  );
  expect(errorMessages.CONFLICT).toBe('Конфликт данных');
  expect(errorMessages.PLAN_PRICE_REQUIRED).toBe('Укажите цену, чтобы создать тариф');
  expect(errorMessages.CHECKOUT_SETTLED).toBe('Эта оплата уже завершена. Начните новую');
  expect(errorMessages.DUPLICATE_VERSION).toBe('Эта версия уже загружена');
  expect(errorMessages.IPA_ZIP_BOMB).toBe('Архив подозрительно сильно сжат и отклонён');
});

it('carries publish blockers in details', () => {
  expect(errorMessages.PUBLISH_BLOCKED).toBe('Нельзя опубликовать: заполните обязательные поля');
  expect(
    apiErrorSchema.parse({
      code: 'PUBLISH_BLOCKED',
      message: errorMessages.PUBLISH_BLOCKED,
      details: ['NO_ICON'],
    }).details,
  ).toEqual(['NO_ICON']);
});

it('sign-in texts live here too', () => {
  expect(signinMessages.TOO_MANY_ATTEMPTS).toBe('Слишком много попыток, попробуйте позже');
  expect(signinMessages.PASSWORD_LOCKED).toBe(
    'Слишком много попыток входа по паролю. Нажмите «Войти по коду из письма» — код придёт на почту.',
  );
  // Staff sign in with a TOTP code as well, so their wrong-credentials text names it.
  expect(signinMessages.STAFF_INVALID_CREDENTIALS).toBe(
    'Неверная почта, пароль или код из приложения',
  );
  expect(signinMessages.CHECK_EMAIL).toMatch(/почт/);
  expect(signinMessages.FAILED).toMatch(/Не получилось войти/);
});

it('connection texts never say «профиль», «UDID», «сертификат» or «аккаунт»', () => {
  const codes = [
    'NO_ACCESS',
    'DEVICE_LIMIT',
    'DEVICE_OWNED',
    'ENROLLMENT_EXPIRED',
    'ENROLLMENT_FAILED',
    'ENROLLMENT_UNAVAILABLE',
    // The connection link also ends with these (`/get/iphone?r=<code>`).
    'RATE_LIMITED',
    'FORBIDDEN',
  ] as const;
  for (const code of codes) {
    expect(ErrorCode[code]).toBe(code);
    expect(errorMessages[code].toLowerCase()).not.toMatch(/профил|udid|сертификат|аккаунт/);
  }
  expect(errorMessages.NO_ACCESS).toMatch(/доступ/);
  expect(errorMessages.DEVICE_LIMIT).toMatch(/другое устройство/);
});
