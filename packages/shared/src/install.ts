import { z } from 'zod';
import { deviceFamily } from './devices.js';

/**
 * Н4: rules shared by the API, the worker and the site (spec 2026-11-21-n4-signing-install-design).
 */

/** Stages of one signing, in order; `failed` can follow any of them. */
export const INSTALL_STAGES = ['queued', 'downloading', 'signing', 'uploading', 'ready'] as const;
export type InstallStage = (typeof INSTALL_STAGES)[number] | 'failed';

/** The line under the install button for each stage (spec Н4 §4). */
export const stageText: Record<InstallStage, string> = {
  queued: 'Проверяем доступ',
  downloading: 'Готовим приложение',
  signing: 'Подписываем сертификатом вашего iPhone',
  uploading: 'Упаковываем',
  ready: 'Готово',
  failed: 'Не получилось подготовить приложение',
};

const RING: Record<InstallStage, { from: number; to: number }> = {
  queued: { from: 0, to: 10 },
  downloading: { from: 10, to: 30 },
  signing: { from: 30, to: 80 },
  uploading: { from: 80, to: 95 },
  ready: { from: 100, to: 100 },
  failed: { from: 0, to: 0 },
};

/**
 * How far the ring may fill during a stage, in percent: it creeps from `from` towards `to` and
 * never reaches `to` until the server reports the next stage. No numbers are shown (v2 §8).
 */
export function stageProgress(stage: InstallStage): { from: number; to: number } {
  return RING[stage];
}

/** BullMQ job id of one signing; custom ids may not contain `:`. */
export function signingQueueJobId(appVersionId: string, deviceCertificateId: string): string {
  return `sign-${appVersionId}-${deviceCertificateId}`;
}

/** `TEAMID.*` covers every app; anything else is an explicit App ID (or a prefix wildcard). */
export function profileKind(appIdPattern: string): 'all' | 'single' {
  return /^[^.]+\.\*$/.test(appIdPattern) ? 'all' : 'single';
}

export type InstallDenial = 'DEVICE_NOT_READY' | 'APP_NOT_AVAILABLE' | 'WRONG_DEVICE';

/** Whether the buyer's device may get this app now; the live subscription is checked by the caller. */
export function canInstall(input: {
  device: { status: string; product: string };
  certificate: { status: string } | null;
  app: { status: string };
  version: { status: string; encrypted: boolean; deviceFamily: number[] } | null;
  now: Date;
}): { ok: true } | { ok: false; reason: InstallDenial } {
  if (input.device.status !== 'active' || input.certificate?.status !== 'active') {
    return { ok: false, reason: 'DEVICE_NOT_READY' };
  }
  const { app, version } = input;
  if (app.status !== 'published' || !version || version.status !== 'published') {
    return { ok: false, reason: 'APP_NOT_AVAILABLE' };
  }
  if (version.encrypted) return { ok: false, reason: 'APP_NOT_AVAILABLE' };
  // An iPhone app runs on an iPad; an iPad-only app does not run on an iPhone.
  const family = deviceFamily(input.device.product);
  const fits =
    family === 'ipad'
      ? version.deviceFamily.some((f) => f === 1 || f === 2)
      : version.deviceFamily.includes(1);
  return fits ? { ok: true } : { ok: false, reason: 'WRONG_DEVICE' };
}

const escapeXml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const asset = (kind: string, url: string): string =>
  `<dict><key>kind</key><string>${kind}</string><key>url</key><string>${escapeXml(url)}</string></dict>`;

/** The OTA manifest iOS reads after `itms-services://?action=download-manifest`. */
export function buildManifest(m: {
  ipaUrl: string;
  icon57Url?: string | undefined;
  icon512Url?: string | undefined;
  bundleId: string;
  bundleVersion: string;
  title: string;
}): string {
  const assets = [
    asset('software-package', m.ipaUrl),
    ...(m.icon57Url ? [asset('display-image', m.icon57Url)] : []),
    ...(m.icon512Url ? [asset('full-size-image', m.icon512Url)] : []),
  ].join('');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict><key>items</key><array><dict>',
    `<key>assets</key><array>${assets}</array>`,
    '<key>metadata</key><dict>',
    `<key>bundle-identifier</key><string>${escapeXml(m.bundleId)}</string>`,
    `<key>bundle-version</key><string>${escapeXml(m.bundleVersion)}</string>`,
    '<key>kind</key><string>software</string>',
    `<key>title</key><string>${escapeXml(m.title)}</string>`,
    '</dict></dict></array></dict></plist>',
  ].join('\n');
}

/** `itms-services://` link for a manifest URL. */
export function itmsUrl(manifestUrl: string): string {
  return `itms-services://?action=download-manifest&url=${encodeURIComponent(manifestUrl)}`;
}

/** `POST /install/apps/:slug` body: `confirmReplace` after the «заменит „…“» question. */
export type InstallRequest = { confirmReplace?: boolean };

/** Answer of `POST /install/apps/:slug` and `GET /install/jobs/:id`. */
export type InstallJobView = {
  jobId: string;
  stage: InstallStage;
  /** Set when `stage` is `failed`. */
  errorCode?: string;
};

/** Answer of `POST /install/jobs/:id/token`. */
export type InstallLink = { itmsUrl: string; expiresAt: string };

export const installJobViewSchema = z.object({
  jobId: z.string().min(1),
  stage: z.enum(['queued', 'downloading', 'signing', 'uploading', 'ready', 'failed']),
  errorCode: z.string().optional(),
});
export const installLinkSchema = z.object({
  itmsUrl: z.string().startsWith('itms-services://'),
  expiresAt: z.string(),
});

/** `GET /install/chosen`: the app the buyer picked before paying (wizard step 3), if still listed. */
export type ChosenApp = { app: { slug: string; name: string } | null };
export const chosenAppSchema = z.object({
  app: z.object({ slug: z.string().min(1), name: z.string().min(1) }).nullable(),
});

/** A row of the admin «Подпись» list (newest first). */
export type SigningJobAdminView = {
  id: string;
  app: string;
  version: string;
  email: string | null;
  stage: InstallStage;
  errorCode: string | null;
  /** Why it failed or waits, admin only (`failReasonText`). */
  failReason: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export const stageLabel: Record<InstallStage, string> = {
  queued: 'В очереди',
  downloading: 'Скачивает',
  signing: 'Подписывает',
  uploading: 'Загружает',
  ready: 'Готово',
  failed: 'Ошибка',
};

/** The admin «Подпись» line for `SigningJob.failReason`. */
const FAIL_REASONS: Record<string, string> = {
  DISK_FULL: 'Мало места на сервере',
  ZSIGN_TIMEOUT: 'Подпись не уложилась во время',
  ZSIGN_EXIT: 'zsign завершился с ошибкой',
  ERROR: 'Ошибка воркера, подробности в журнале',
};
export const failReasonText = (reason: string): string => FAIL_REASONS[reason] ?? reason;
