import { spawn } from 'node:child_process';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import forge from 'node-forge';
import { SigningError } from './errors.js';

export type ParsedP12 = {
  certificate: X509Certificate;
  /** PKCS#8 PEM. Never log or serialize. */
  privateKeyPem: string;
  /** Other certificates in the file (usually the Apple WWDR intermediate). */
  chain: X509Certificate[];
};

const certToNode = (cert: forge.pki.Certificate): X509Certificate =>
  new X509Certificate(
    Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(), 'binary'),
  );

/** node-forge: fast, in process; handles 3DES/RC2 and ASCII passwords with PBES2 (AES). */
function viaForge(p12: Buffer, password: string): { keyPem: string; certs: X509Certificate[] } {
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12.toString('binary')));
  const parsed = forge.pkcs12.pkcs12FromAsn1(asn1, true, password);
  let keyPem: string | null = null;
  const certs: X509Certificate[] = [];
  for (const safe of parsed.safeContents) {
    for (const bag of safe.safeBags) {
      if (bag.cert) certs.push(certToNode(bag.cert));
      else if (bag.key && !keyPem) {
        keyPem = forge.pki.privateKeyInfoToPem(
          forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(bag.key)),
        );
      }
    }
  }
  if (!keyPem) throw new Error('no key');
  return { keyPem, certs };
}

/**
 * The `openssl` binary: OpenSSL 3 defaults (PBES2 + AES with a non-ASCII password, which
 * node-forge decodes wrongly) and, with `-legacy`, RC2-40 files of old Keychain exports. The
 * password goes through fd 3 (never argv or env), the file through stdin.
 */
function viaOpenssl(p12: Buffer, password: string, legacy: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['pkcs12', '-nodes', '-passin', 'fd:3'];
    if (legacy) args.push('-legacy');
    const child = spawn('openssl', args, { stdio: ['pipe', 'pipe', 'ignore', 'pipe'] });
    const out: Buffer[] = [];
    const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
    child.on('error', reject);
    child.stdout?.on('data', (chunk: Buffer) => out.push(chunk));
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(out).toString('utf8'));
      else reject(new Error('openssl failed'));
    });
    const fd3 = child.stdio[3] as NodeJS.WritableStream;
    fd3.on('error', () => {});
    fd3.end(`${password}\n`);
    child.stdin?.on('error', () => {});
    child.stdin?.end(p12);
  });
}

function fromPem(pem: string): { keyPem: string; certs: X509Certificate[] } {
  const blocks = pem.match(/-----BEGIN ([A-Z ]+)-----[\s\S]+?-----END \1-----/g) ?? [];
  const keyPem = blocks.find((b) => /PRIVATE KEY-----$/.test(b.split('\n')[0] ?? ''));
  if (!keyPem) throw new Error('no key');
  const certs = blocks
    .filter((b) => b.startsWith('-----BEGIN CERTIFICATE-----'))
    .map((b) => new X509Certificate(b));
  return {
    keyPem: createPrivateKey(keyPem).export({ type: 'pkcs8', format: 'pem' }).toString(),
    certs,
  };
}

/**
 * Opens a supplier `.p12` with the password exactly as typed (no trimming; a line break is not
 * allowed). The certificate is the one matching the private key; any failure is `P12_INVALID`.
 */
export async function parseP12(p12: Buffer, password: string): Promise<ParsedP12> {
  if (password.includes('\n') || password.includes('\r')) throw new SigningError('P12_INVALID');
  let opened: { keyPem: string; certs: X509Certificate[] } | null = null;
  try {
    opened = viaForge(p12, password);
  } catch {
    for (const legacy of [false, true]) {
      try {
        opened = fromPem(await viaOpenssl(p12, password, legacy));
        break;
      } catch {
        // next attempt
      }
    }
  }
  if (!opened) throw new SigningError('P12_INVALID');
  const key = createPrivateKey(opened.keyPem);
  const leaf = opened.certs.find((c) => c.checkPrivateKey(key));
  if (!leaf) throw new SigningError('P12_INVALID');
  return {
    certificate: leaf,
    privateKeyPem: opened.keyPem,
    chain: opened.certs.filter((c) => c !== leaf),
  };
}
