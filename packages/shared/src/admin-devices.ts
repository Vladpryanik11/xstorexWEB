import { z } from 'zod';
import type { DeviceFamily, DeviceStatus } from './devices.js';

/** Supplier file limits (spec «Сертификаты от поставщика» §5.2). */
export const CERT_P12_MAX_BYTES = 50 * 1024;
export const CERT_PROFILE_MAX_BYTES = 1024 * 1024;
export const CERT_PASSWORD_MAX = 128;

const base64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/, 'base64');
const decodedLength = (s: string): number =>
  Math.floor((s.length * 3) / 4) - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0);

/** `POST /admin/devices/:id/certificate`: the files as base64, the password exactly as typed. */
export const certificateUploadSchema = z.object({
  p12: base64.min(4).refine((s) => decodedLength(s) <= CERT_P12_MAX_BYTES, 'too large'),
  password: z
    .string()
    .max(CERT_PASSWORD_MAX)
    .refine((s) => !/[\r\n]/.test(s), 'line break'),
  profile: base64.min(4).refine((s) => decodedLength(s) <= CERT_PROFILE_MAX_BYTES, 'too large'),
});
export type CertificateUpload = z.infer<typeof certificateUploadSchema>;

/** Why a device is in «Ждут сертификата». */
export type WaitingReason = 'new' | 'revoked' | 'expired' | 'deleted' | 'expiring';

export const waitingReasonLabel: Record<WaitingReason, string> = {
  new: 'Новое',
  revoked: 'Отозван',
  expired: 'Истёк',
  deleted: 'Удалён',
  expiring: 'Истекает',
};

export type WaitingDevice = {
  id: string;
  email: string;
  model: string;
  family: DeviceFamily;
  /** Full UDID: admin only. */
  udid: string;
  reason: WaitingReason;
  /** ISO: when the wait began (binding, or the end of the last files). */
  since: string;
  /** ISO, `expiring` only: the end of the current files. */
  expiresAt?: string;
  /** Waits longer than 24 hours (never for `expiring`). */
  overdue: boolean;
};

export type DeviceCertificateStatus = 'active' | 'replaced' | 'revoked' | 'expired' | 'deleted';

export const certificateStatusLabel: Record<DeviceCertificateStatus, string> = {
  active: 'Действует',
  replaced: 'Заменён',
  revoked: 'Отозван',
  expired: 'Истёк',
  deleted: 'Удалён',
};

export type DeviceCertificateView = {
  id: string;
  status: DeviceCertificateStatus;
  teamId: string;
  certSerial: string;
  certNotAfter: string;
  profileExpiresAt: string;
  createdAt: string;
  endedAt: string | null;
};

export type DeviceCard = {
  id: string;
  email: string;
  model: string;
  family: DeviceFamily;
  udid: string;
  status: DeviceStatus;
  /** Whether the device's subscription has live access now. */
  live: boolean;
  /** Set while the device is in «Ждут сертификата». */
  waiting: Omit<WaitingDevice, 'id' | 'email' | 'model' | 'family' | 'udid'> | null;
  certificates: DeviceCertificateView[];
};
