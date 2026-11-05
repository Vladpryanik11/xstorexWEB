import { z } from 'zod';

export const udidSchema = z.string().regex(/^([0-9a-f]{40}|[0-9A-F]{8}-[0-9A-F]{16})$/);
export const deviceStatusSchema = z.enum([
  'new',
  'pending',
  'processing',
  'active',
  'blocked',
  'expired',
]);
export type DeviceStatus = z.infer<typeof deviceStatusSchema>;

export const deviceStatusLabel: Record<DeviceStatus, string> = {
  new: 'Новое',
  pending: 'Ожидает регистрации',
  processing: 'Регистрируется в Apple (до 72 часов)',
  active: 'Активно',
  blocked: 'Заблокировано',
  expired: 'Срок истёк',
};

export function maskUdid(udid: string): string {
  return `${udid.slice(0, 8)}-…${udid.slice(-4)}`;
}

// Hardware identifiers checked against DeviceKit, 2026-11-05:
// https://github.com/devicekit/DeviceKit/blob/master/Source/Device.generated.swift
const modelNames: Record<string, string> = {
  'iPhone11,2': 'iPhone XS',
  'iPhone11,4': 'iPhone XS Max',
  'iPhone11,6': 'iPhone XS Max',
  'iPhone11,8': 'iPhone XR',
  'iPhone12,1': 'iPhone 11',
  'iPhone12,3': 'iPhone 11 Pro',
  'iPhone12,5': 'iPhone 11 Pro Max',
  'iPhone12,8': 'iPhone SE (2-го поколения)',
  'iPhone13,1': 'iPhone 12 mini',
  'iPhone13,2': 'iPhone 12',
  'iPhone13,3': 'iPhone 12 Pro',
  'iPhone13,4': 'iPhone 12 Pro Max',
  'iPhone14,4': 'iPhone 13 mini',
  'iPhone14,5': 'iPhone 13',
  'iPhone14,2': 'iPhone 13 Pro',
  'iPhone14,3': 'iPhone 13 Pro Max',
  'iPhone14,6': 'iPhone SE (3-го поколения)',
  'iPhone14,7': 'iPhone 14',
  'iPhone14,8': 'iPhone 14 Plus',
  'iPhone15,2': 'iPhone 14 Pro',
  'iPhone15,3': 'iPhone 14 Pro Max',
  'iPhone15,4': 'iPhone 15',
  'iPhone15,5': 'iPhone 15 Plus',
  'iPhone16,1': 'iPhone 15 Pro',
  'iPhone16,2': 'iPhone 15 Pro Max',
  'iPhone17,1': 'iPhone 16 Pro',
  'iPhone17,2': 'iPhone 16 Pro Max',
  'iPhone17,3': 'iPhone 16',
  'iPhone17,4': 'iPhone 16 Plus',
  'iPhone17,5': 'iPhone 16e',
  'iPhone18,1': 'iPhone 17 Pro',
  'iPhone18,2': 'iPhone 17 Pro Max',
  'iPhone18,3': 'iPhone 17',
  'iPhone18,4': 'iPhone Air',
  'iPhone18,5': 'iPhone 17e',
  'iPhone19,2': 'iPhone 18 Pro',
  'iPhone19,3': 'iPhone 18 Pro Max',
  'iPhone19,7': 'iPhone 18 Pro Max',
  'iPhone19,4': 'iPhone Duo',
  'iPad12,1': 'iPad (9-го поколения)',
  'iPad12,2': 'iPad (9-го поколения)',
  'iPad13,18': 'iPad (10-го поколения)',
  'iPad13,19': 'iPad (10-го поколения)',
  'iPad15,7': 'iPad (A16)',
  'iPad15,8': 'iPad (A16)',
  'iPad13,1': 'iPad Air (4-го поколения)',
  'iPad13,2': 'iPad Air (4-го поколения)',
  'iPad13,16': 'iPad Air (5-го поколения)',
  'iPad13,17': 'iPad Air (5-го поколения)',
  'iPad14,1': 'iPad mini (6-го поколения)',
  'iPad14,2': 'iPad mini (6-го поколения)',
  'iPad16,1': 'iPad mini (A17 Pro)',
  'iPad16,2': 'iPad mini (A17 Pro)',
  'iPad16,3': 'iPad Pro 11″ (M4)',
  'iPad16,4': 'iPad Pro 11″ (M4)',
  'iPad16,5': 'iPad Pro 13″ (M4)',
  'iPad16,6': 'iPad Pro 13″ (M4)',
};

export function deviceModelName(product: string): string {
  return (Object.hasOwn(modelNames, product) ? modelNames[product] : undefined) ?? product;
}

export const deviceViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  model: z.string(),
  status: deviceStatusSchema,
  statusLabel: z.string(),
  registeredAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type DeviceView = z.infer<typeof deviceViewSchema>;
