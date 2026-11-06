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

export const udidSchema = z
  .string()
  .regex(/^([0-9a-f]{40}|[0-9A-F]{8}-[0-9A-F]{16})$/);

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

export const deviceStatusLabel: Record<DeviceStatus, string> = {
  new: 'Новое',
  pending: 'Ожидает регистрации',
  processing: 'Регистрируется в Apple (до 72 часов)',
  active: 'Зарегистрировано в Apple',
  blocked: 'Заблокировано',
  expired: 'Срок истёк',
};

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
