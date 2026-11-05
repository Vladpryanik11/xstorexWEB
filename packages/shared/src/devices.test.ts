import { expect, it } from 'vitest';
import { emailSchema, normalizeEmail } from './auth.js';
import {
  deviceModelName,
  deviceStatusLabel,
  deviceViewSchema,
  maskUdid,
  udidSchema,
} from './devices.js';
import { ErrorCode, errorMessages } from './errors.js';

it('accepts both UDID formats and rejects malformed identifiers', () => {
  expect(udidSchema.parse('00008110-001A2B3C4D5E6F70')).toBe('00008110-001A2B3C4D5E6F70');
  expect(udidSchema.parse('a'.repeat(40))).toBe('a'.repeat(40));
  for (const value of ['', '00008110001A2B3C4D5E6F70', 'a'.repeat(39), 'g'.repeat(40), ' x']) {
    expect(udidSchema.safeParse(value).success).toBe(false);
  }
});

it('masks a UDID without exposing the full identifier', () => {
  expect(maskUdid('00008110-001A2B3C4D5E6F70')).toBe('00008110-…6F70');
  expect(maskUdid('0123456789abcdef0123456789abcdef01234567')).toBe('01234567-…4567');
});

it('names known iPhones and iPads and preserves unknown model identifiers', () => {
  expect(deviceModelName('iPhone11,2')).toBe('iPhone XS');
  expect(deviceModelName('iPhone15,2')).toBe('iPhone 14 Pro');
  expect(deviceModelName('iPhone19,2')).toBe('iPhone 18 Pro');
  expect(deviceModelName('iPad13,18')).toBe('iPad (10-го поколения)');
  expect(deviceModelName('iPhone99,99')).toBe('iPhone99,99');
});

it('normalizes email consistently and validates the normalized address', () => {
  expect(normalizeEmail(' Ivan@Mail.RU ')).toBe('ivan@mail.ru');
  expect(emailSchema.parse(' Ivan@Mail.RU ')).toBe('ivan@mail.ru');
  expect(emailSchema.safeParse('not an email').success).toBe(false);
});

it('describes all device states in Russian and validates device responses', () => {
  expect(deviceStatusLabel).toEqual({
    new: 'Новое',
    pending: 'Ожидает регистрации',
    processing: 'Регистрируется в Apple (до 72 часов)',
    active: 'Активно',
    blocked: 'Заблокировано',
    expired: 'Срок истёк',
  });
  const view = {
    id: 'device-1',
    name: 'Мой iPhone',
    model: 'iPhone 14 Pro',
    status: 'new',
    statusLabel: deviceStatusLabel.new,
    registeredAt: null,
    createdAt: '2026-11-05T12:00:00.000Z',
  };
  expect(deviceViewSchema.parse(view)).toEqual(view);
  expect(deviceViewSchema.safeParse({ ...view, status: 'unknown' }).success).toBe(false);
});

it('exports the planned sign-in error codes with Russian messages', () => {
  expect(ErrorCode.ENROLLMENT_EXPIRED).toBe('ENROLLMENT_EXPIRED');
  expect(errorMessages.ENROLLMENT_EXPIRED).toBe('Время входа истекло. Начните заново.');
  expect(errorMessages.ENROLLMENT_INVALID).toBe(
    'Не удалось проверить ответ устройства. Попробуйте ещё раз.',
  );
  expect(errorMessages.DEVICE_OWNED).toBe(
    'Это устройство уже привязано к другому аккаунту. Напишите в поддержку.',
  );
  expect(errorMessages.ACCOUNT_BLOCKED).toBe('Аккаунт заблокирован');
  expect(errorMessages.CODE_INVALID).toBe('Неверный или устаревший код');
  expect(errorMessages.EMAIL_TAKEN).toBe('Эта почта уже привязана к другому аккаунту');
});
