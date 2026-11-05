import { createPrivateKey, createPublicKey } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Certificate } from 'pkijs';
import { CmsError } from './cms.js';
import { enrollmentCrypto } from './crypto-engine.js';

export interface SigningIdentity {
  certificate: Certificate;
  chain: Certificate[];
  privateKey: CryptoKey;
}

const HOUR_MS = 60 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; identity: Promise<SigningIdentity> }>();

export async function loadSigningIdentity(
  certPath: string,
  keyPath: string,
): Promise<SigningIdentity> {
  const id = JSON.stringify([resolve(certPath), resolve(keyPath)]);
  const cached = cache.get(id);
  if (cached && Date.now() < cached.expiresAt) return cached.identity;
  const entry = { expiresAt: Date.now() + HOUR_MS, identity: readIdentity(certPath, keyPath) };
  cache.set(id, entry);
  try {
    return await entry.identity;
  } catch {
    if (cache.get(id) === entry) cache.delete(id);
    throw new CmsError();
  }
}

async function readIdentity(certPath: string, keyPath: string): Promise<SigningIdentity> {
  try {
    const [certPem, keyPem] = await Promise.all([readFile(certPath, 'utf8'), readFile(keyPath)]);
    const certPattern =
      /-----BEGIN CERTIFICATE-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END CERTIFICATE-----/g;
    const blocks = [...certPem.matchAll(certPattern)];
    if (!blocks.length || certPem.replace(certPattern, '').trim()) throw new CmsError();
    const certificates = blocks.map((block) =>
      Certificate.fromBER(Buffer.from(block[1]?.replace(/\s/g, '') ?? '', 'base64')),
    );
    const certificate = certificates[0];
    const firstBlock = blocks[0]?.[0];
    if (!certificate || !firstBlock) throw new CmsError();
    const key = createPrivateKey(keyPem);
    const fromKey = createPublicKey(key).export({ format: 'der', type: 'spki' });
    const fromCert = createPublicKey(firstBlock).export({ format: 'der', type: 'spki' });
    if (!fromKey.equals(fromCert)) throw new CmsError();
    let algorithm: RsaHashedImportParams | EcKeyImportParams;
    if (key.asymmetricKeyType === 'rsa') {
      algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    } else if (
      key.asymmetricKeyType === 'ec' &&
      key.asymmetricKeyDetails?.namedCurve === 'prime256v1'
    ) {
      algorithm = { name: 'ECDSA', namedCurve: 'P-256' };
    } else {
      throw new CmsError();
    }
    const pkcs8 = key.export({ format: 'der', type: 'pkcs8' });
    const privateKey = await enrollmentCrypto.importKey(
      'pkcs8',
      Uint8Array.from(pkcs8),
      algorithm,
      false,
      ['sign'],
    );
    return { certificate, chain: certificates.slice(1), privateKey };
  } catch {
    throw new CmsError();
  }
}
