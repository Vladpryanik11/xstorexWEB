import { createPrivateKey, type KeyObject, X509Certificate } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import type { SigningIdentity } from './cms.js';

/** The profile signer cannot be loaded. The message names the problem, never the key. */
export class IdentityError extends Error {
  override name = 'IdentityError';
}

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

  constructor(paths: { certPath: string; keyPath: string }) {
    this.certPath = paths.certPath;
    this.keyPath = paths.keyPath;
  }

  async get(): Promise<SigningIdentity> {
    const stamp = await this.stamp();
    if (this.cached?.stamp === stamp) return this.cached.identity;
    const identity = await this.load();
    this.cached = { stamp, identity };
    return identity;
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
