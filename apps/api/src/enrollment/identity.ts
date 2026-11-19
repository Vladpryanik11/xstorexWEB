import { createPrivateKey, type KeyObject, X509Certificate } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { Logger } from '@nestjs/common';
import type { SigningIdentity } from './cms.js';

/** The profile signer cannot be loaded. The message names the problem, never the key. */
export class IdentityError extends Error {
  override name = 'IdentityError';
}

/** Told when new files fail to load and the last good pair keeps signing. `reason` is safe to log. */
export type FallbackWarn = (message: string, reason: string) => void;

const FALLBACK_MESSAGE =
  'enrollment signer: new files not loaded, signing with the last good certificate';

const logger = new Logger('IdentityStore');
const defaultWarn: FallbackWarn = (message, reason) => logger.warn({ reason }, message);

const PEM_CERT = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;

/**
 * Profile signer from PEM files (`ENROLL_CERT_PATH`, `ENROLL_KEY_PATH`). In production these are
 * Caddy's certificate and key for SITE_DOMAIN; Caddy renews them in place, so the files are read
 * again whenever their modification time or size changes, without restarting the API.
 */
export class IdentityStore {
  private readonly certPath: string;
  private readonly keyPath: string;
  private cached: { stamp: string; identity: SigningIdentity } | null = null;
  /** The failed state already warned about, so a broken renewal is logged once, not per request. */
  private warnedFor: string | null = null;

  constructor(
    paths: { certPath: string; keyPath: string },
    private readonly warn: FallbackWarn = defaultWarn,
  ) {
    this.certPath = paths.certPath;
    this.keyPath = paths.keyPath;
  }

  /**
   * A renewal writes the certificate and the key one after the other, so for a moment the files
   * may be missing, half written or not a pair. Until the new pair loads, the last good identity
   * keeps signing while its certificate is still valid; the files are tried again on each call.
   * Each distinct failed state is warned about once (fixed text and the reason, never key data).
   */
  async get(): Promise<SigningIdentity> {
    let stamp = 'missing';
    try {
      stamp = await this.stamp();
      if (this.cached?.stamp === stamp) return this.cached.identity;
      const identity = await this.load();
      this.cached = { stamp, identity };
      this.warnedFor = null;
      return identity;
    } catch (err) {
      const last = this.cached?.identity;
      if (err instanceof IdentityError && last && new Date(last.certificate.validTo) > new Date()) {
        if (this.warnedFor !== stamp) {
          this.warnedFor = stamp;
          this.warn(FALLBACK_MESSAGE, err.message);
        }
        return last;
      }
      throw err;
    }
  }

  private async stamp(): Promise<string> {
    try {
      const [cert, key] = await Promise.all([stat(this.certPath), stat(this.keyPath)]);
      return `${cert.mtimeMs}:${cert.size}:${key.mtimeMs}:${key.size}`;
    } catch {
      throw new IdentityError('Profile signing certificate or key file is missing');
    }
  }

  private async load(): Promise<SigningIdentity> {
    let certPem: string;
    let keyPem: string;
    try {
      [certPem, keyPem] = await Promise.all([
        readFile(this.certPath, 'utf8'),
        readFile(this.keyPath, 'utf8'),
      ]);
    } catch {
      throw new IdentityError('Profile signing certificate or key file cannot be read');
    }
    let certificates: X509Certificate[];
    try {
      certificates = (certPem.match(PEM_CERT) ?? []).map((pem) => new X509Certificate(pem));
    } catch {
      throw new IdentityError('Profile signing certificate is not valid PEM');
    }
    const [certificate, ...chain] = certificates;
    if (!certificate)
      throw new IdentityError('Profile signing certificate file has no certificate');
    let privateKey: KeyObject;
    try {
      privateKey = createPrivateKey(keyPem);
    } catch {
      throw new IdentityError('Profile signing key is not a valid PEM private key');
    }
    if (!certificate.checkPrivateKey(privateKey)) {
      throw new IdentityError('Profile signing key does not match the certificate');
    }
    return { certificate, chain, privateKey };
  }
}
