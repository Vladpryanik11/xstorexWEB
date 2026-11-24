import { describe, expect, it } from 'vitest';
import {
  buildManifest,
  canInstall,
  failReasonText,
  INSTALL_STAGES,
  profileKind,
  signingQueueJobId,
  stageProgress,
} from './install.js';

const NOW = new Date('2026-11-21T12:00:00Z');
const OK = {
  device: { status: 'active' as const, product: 'iPhone15,2' },
  certificate: { status: 'active' as const },
  app: { status: 'published' as const },
  version: { status: 'published' as const, encrypted: false, deviceFamily: [1, 2] },
};

describe('profileKind', () => {
  it('tells a wildcard profile from a single-app one', () => {
    expect(profileKind('TEAM123456.*')).toBe('all');
    expect(profileKind('TEAM123456.ru.supplier.one')).toBe('single');
  });
});

describe('canInstall', () => {
  it('ready device installs', () => {
    expect(canInstall({ ...OK, now: NOW })).toEqual({ ok: true });
  });
  it('device without live files is refused', () => {
    expect(canInstall({ ...OK, certificate: null, now: NOW })).toEqual({
      ok: false,
      reason: 'DEVICE_NOT_READY',
    });
    expect(canInstall({ ...OK, device: { ...OK.device, status: 'processing' }, now: NOW })).toEqual(
      { ok: false, reason: 'DEVICE_NOT_READY' },
    );
  });
  it('encrypted version is not available', () => {
    expect(canInstall({ ...OK, version: { ...OK.version, encrypted: true }, now: NOW })).toEqual({
      ok: false,
      reason: 'APP_NOT_AVAILABLE',
    });
    expect(canInstall({ ...OK, version: null, now: NOW })).toEqual({
      ok: false,
      reason: 'APP_NOT_AVAILABLE',
    });
    expect(canInstall({ ...OK, app: { status: 'hidden' }, now: NOW })).toEqual({
      ok: false,
      reason: 'APP_NOT_AVAILABLE',
    });
  });
  it('iPad-only app on iPhone is refused', () => {
    expect(canInstall({ ...OK, version: { ...OK.version, deviceFamily: [2] }, now: NOW })).toEqual({
      ok: false,
      reason: 'WRONG_DEVICE',
    });
    expect(
      canInstall({
        ...OK,
        device: { status: 'active', product: 'iPad13,1' },
        version: { ...OK.version, deviceFamily: [2] },
        now: NOW,
      }),
    ).toEqual({ ok: true });
  });
  it('an iPhone app runs on an iPad', () => {
    expect(
      canInstall({
        ...OK,
        device: { status: 'active', product: 'iPad13,1' },
        version: { ...OK.version, deviceFamily: [1] },
        now: NOW,
      }),
    ).toEqual({ ok: true });
  });
});

describe('stageProgress', () => {
  it('stages fill the ring in order', () => {
    let last = 0;
    for (const stage of INSTALL_STAGES) {
      const { from, to } = stageProgress(stage);
      expect(from).toBeGreaterThanOrEqual(last);
      if (stage !== 'ready') expect(to).toBeGreaterThan(from);
      last = to;
    }
    expect(stageProgress('ready')).toEqual({ from: 100, to: 100 });
  });
});

describe('signingQueueJobId', () => {
  it('names version and device files', () => {
    expect(signingQueueJobId('v1', 'c1')).toBe('sign-v1-c1');
  });
});

describe('buildManifest', () => {
  const M = {
    ipaUrl: 'https://dl.example/signed/a.ipa?X-Amz-Signature=1&b=2',
    icon57Url: 'https://dl.example/i57.png',
    icon512Url: 'https://dl.example/i512.png',
    bundleId: 'com.example.app',
    bundleVersion: '1.2.3',
    title: 'Пример',
  };
  it('escapes the title', () => {
    const xml = buildManifest({ ...M, title: 'Tom & Jerry <Pro> "2" 🚀' });
    expect(xml).toContain('<string>Tom &amp; Jerry &lt;Pro&gt; &quot;2&quot; 🚀</string>');
    expect(xml).toContain('X-Amz-Signature=1&amp;b=2');
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });
  it('lists the three assets', () => {
    const xml = buildManifest(M);
    const kinds = [...xml.matchAll(/<key>kind<\/key>\s*<string>([^<]+)<\/string>/g)].map(
      (m) => m[1],
    );
    expect(kinds).toEqual(['software-package', 'display-image', 'full-size-image', 'software']);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });
  it('skips icons that are missing', () => {
    const xml = buildManifest({ ...M, icon57Url: undefined, icon512Url: undefined });
    expect(xml).not.toContain('display-image');
  });
});

describe('failReasonText', () => {
  it('names each admin-only reason and passes an unknown one through', () => {
    expect(failReasonText('DISK_FULL')).toBe('Мало места на сервере');
    expect(failReasonText('ZSIGN_TIMEOUT')).toBe('Подпись не уложилась во время');
    expect(failReasonText('ZSIGN_EXIT')).toBe('zsign завершился с ошибкой');
    expect(failReasonText('ERROR')).toBe('Ошибка воркера, подробности в журнале');
    expect(failReasonText('NEW_ONE')).toBe('NEW_ONE');
  });
});
