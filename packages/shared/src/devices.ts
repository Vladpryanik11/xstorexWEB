import { z } from 'zod';

export const deviceStatusSchema = z.enum([
  'new',
  'pending',
  'processing',
  'active',
  'blocked',
  'expired',
]);
export type DeviceStatus = z.infer<typeof deviceStatusSchema>;

export const enrollmentStatusSchema = z.enum(['pending', 'completed', 'failed', 'expired']);
export type EnrollmentStatus = z.infer<typeof enrollmentStatusSchema>;

export const udidSchema = z.string().regex(/^([0-9a-f]{40}|[0-9A-F]{8}-[0-9A-F]{16})$/);

export function maskUdid(udid: string): string {
  if (!udidSchema.safeParse(udid).success) return '••••';
  return `${udid.slice(0, 8)}-…${udid.slice(-4)}`;
}

const DEVICE_MODELS: Record<string, string> = {
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
  'iPhone14,2': 'iPhone 13 Pro',
  'iPhone14,3': 'iPhone 13 Pro Max',
  'iPhone14,4': 'iPhone 13 mini',
  'iPhone14,5': 'iPhone 13',
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
  'iPhone18,1': 'iPhone 17 Pro',
  'iPhone18,2': 'iPhone 17 Pro Max',
  'iPhone18,3': 'iPhone 17',
  'iPhone18,4': 'iPhone 17 Air',
  'iPad8,1': 'iPad Pro 11-inch (1-го поколения)',
  'iPad8,2': 'iPad Pro 11-inch (1-го поколения)',
  'iPad8,3': 'iPad Pro 11-inch (1-го поколения)',
  'iPad8,4': 'iPad Pro 11-inch (1-го поколения)',
  'iPad8,5': 'iPad Pro 12.9-inch (3-го поколения)',
  'iPad8,6': 'iPad Pro 12.9-inch (3-го поколения)',
  'iPad8,7': 'iPad Pro 12.9-inch (3-го поколения)',
  'iPad8,8': 'iPad Pro 12.9-inch (3-го поколения)',
  'iPad11,1': 'iPad mini (5-го поколения)',
  'iPad11,2': 'iPad mini (5-го поколения)',
  'iPad11,3': 'iPad Air (3-го поколения)',
  'iPad11,4': 'iPad Air (3-го поколения)',
  'iPad11,6': 'iPad (8-го поколения)',
  'iPad11,7': 'iPad (8-го поколения)',
};

export function deviceModelName(product: string): string {
  return DEVICE_MODELS[product] ?? product;
}

export type DeviceFamily = 'iphone' | 'ipad';

/** iPad by the `PRODUCT` prefix iOS sends (`iPad13,1`); anything else is treated as an iPhone. */
export function deviceFamily(product: string): DeviceFamily {
  return product.startsWith('iPad') ? 'ipad' : 'iphone';
}

export type BindDecision =
  | { ok: true; reuse: boolean }
  | { ok: false; code: 'NO_ACCESS' | 'DEVICE_OWNED' | 'DEVICE_LIMIT' };

/**
 * Whether a device iOS reported may be bound to the buyer's access. Stage 1: one device per
 * buyer, bound for good. A device owned by another buyer never moves; a buyer who already has a
 * different device gets `DEVICE_LIMIT`. `reuse` means the buyer's own `Device` row is kept (a
 * repeated enrollment of the same iPhone), otherwise a new row is created.
 *
 * `udidOwnerId` — owner of an existing `Device` with this UDID; `buyerDeviceUdid` — UDID of the
 * device the buyer already has, if any.
 */
export function bindDecision(input: {
  udidOwnerId: string | null;
  buyerId: string;
  buyerDeviceUdid: string | null;
  udid: string;
  hasAccess: boolean;
}): BindDecision {
  if (!input.hasAccess) return { ok: false, code: 'NO_ACCESS' };
  if (input.udidOwnerId !== null && input.udidOwnerId !== input.buyerId) {
    return { ok: false, code: 'DEVICE_OWNED' };
  }
  if (input.buyerDeviceUdid !== null && input.buyerDeviceUdid !== input.udid) {
    return { ok: false, code: 'DEVICE_LIMIT' };
  }
  return { ok: true, reuse: input.udidOwnerId === input.buyerId };
}

/** Status texts for people; on an iPad the interface says «iPad» instead of «iPhone». */
export const deviceStatusLabel: Record<DeviceStatus, string> = {
  new: 'Новое',
  pending: 'Готовим ваш iPhone, обычно до 24 часов',
  processing: 'Обновляем доступ, обычно до 24 часов',
  active: 'iPhone готов',
  blocked: 'Заблокировано',
  expired: 'Срок истёк',
};

/** `deviceStatusLabel` for the given device: «iPad» instead of «iPhone» on an iPad. */
export function deviceStatusText(status: DeviceStatus, family: DeviceFamily): string {
  const text = deviceStatusLabel[status];
  return family === 'ipad' ? text.replaceAll('iPhone', 'iPad') : text;
}

export const renameDeviceSchema = z.object({
  name: z.string().trim().min(1).max(40),
});

export type DeviceView = {
  id: string;
  name: string;
  model: string;
  udidMasked: string;
  status: DeviceStatus;
  statusLabel: string;
  registeredAt: string | null;
  createdAt: string;
};

export const deviceViewSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  model: z.string().min(1),
  udidMasked: z.string().min(1),
  status: deviceStatusSchema,
  statusLabel: z.string().min(1),
  registeredAt: z.string().nullable(),
  createdAt: z.string(),
});
