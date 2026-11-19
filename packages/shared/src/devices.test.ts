import { describe, expect, it } from 'vitest';
import {
  bindDecision,
  deviceFamily,
  deviceStatusLabel,
  deviceStatusText,
  renameDeviceSchema,
} from './devices.js';

it('trims device names and accepts up to 40 characters', () => {
  expect(renameDeviceSchema.parse({ name: '  My iPhone  ' }).name).toBe('My iPhone');
  expect(renameDeviceSchema.safeParse({ name: 'x'.repeat(40) }).success).toBe(true);
});

it('rejects empty and overlong device names', () => {
  expect(renameDeviceSchema.safeParse({ name: '   ' }).success).toBe(false);
  expect(renameDeviceSchema.safeParse({ name: 'x'.repeat(41) }).success).toBe(false);
});

describe('deviceFamily', () => {
  it('iPad по префиксу PRODUCT', () => {
    expect(deviceFamily('iPad13,1')).toBe('ipad');
  });
  it('всё остальное — iPhone', () => {
    expect(deviceFamily('iPhone16,2')).toBe('iphone');
    expect(deviceFamily('')).toBe('iphone');
  });
});

describe('deviceStatusLabel', () => {
  it('ожидание и регистрация — «обычно до 24 часов», готово — «iPhone готов»', () => {
    expect(deviceStatusLabel.pending).toBe('Готовим ваш iPhone, обычно до 24 часов');
    expect(deviceStatusLabel.processing).toBe('Готовим ваш iPhone, обычно до 24 часов');
    expect(deviceStatusLabel.active).toBe('iPhone готов');
    expect(Object.values(deviceStatusLabel).join(' ')).not.toMatch(/72|UDID|профиль|сертификат/i);
  });
});

describe('deviceStatusText', () => {
  it('на iPad везде «iPad» вместо «iPhone»', () => {
    expect(deviceStatusText('pending', 'ipad')).toBe('Готовим ваш iPad, обычно до 24 часов');
    expect(deviceStatusText('active', 'ipad')).toBe('iPad готов');
    expect(deviceStatusText('active', 'iphone')).toBe('iPhone готов');
    expect(deviceStatusText('blocked', 'ipad')).toBe('Заблокировано');
  });
});

describe('bindDecision', () => {
  const base = {
    udidOwnerId: null,
    buyerId: 'u1',
    buyerDeviceUdid: null,
    udid: 'A',
    hasAccess: true,
  };
  it('новое устройство у покупателя без устройства', () => {
    expect(bindDecision(base)).toEqual({ ok: true, reuse: false });
  });
  it('нет доступа → NO_ACCESS', () => {
    expect(bindDecision({ ...base, hasAccess: false })).toEqual({ ok: false, code: 'NO_ACCESS' });
  });
  it('UDID у другого покупателя → DEVICE_OWNED', () => {
    expect(bindDecision({ ...base, udidOwnerId: 'u2' })).toEqual({
      ok: false,
      code: 'DEVICE_OWNED',
    });
  });
  it('у покупателя другое устройство → DEVICE_LIMIT', () => {
    expect(bindDecision({ ...base, buyerDeviceUdid: 'B' })).toEqual({
      ok: false,
      code: 'DEVICE_LIMIT',
    });
  });
  it('тот же UDID у того же покупателя → повторное использование', () => {
    expect(bindDecision({ ...base, udidOwnerId: 'u1', buyerDeviceUdid: 'A' })).toEqual({
      ok: true,
      reuse: true,
    });
  });
  it('своё устройство без привязки к доступу тоже переиспользуется', () => {
    expect(bindDecision({ ...base, udidOwnerId: 'u1' })).toEqual({ ok: true, reuse: true });
  });
  it('без доступа отказ даже для своего устройства', () => {
    expect(
      bindDecision({ ...base, udidOwnerId: 'u1', buyerDeviceUdid: 'A', hasAccess: false }),
    ).toEqual({ ok: false, code: 'NO_ACCESS' });
  });
});
