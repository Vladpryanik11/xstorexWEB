import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as asn1js from 'asn1js';
import {
  BasicConstraints,
  CertificateChainValidationEngine,
  ContentInfo,
  Extension,
  SignedData,
} from 'pkijs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  certPem,
  createTestCa,
  keyPem,
  testIdentity,
} from '../../test/helpers/enrollment-identity.js';
import { CmsError, signCms, verifyCms } from './cms.js';

let root: Awaited<ReturnType<typeof createTestCa>>;
let otherRoot: typeof root;
let rsa: Awaited<ReturnType<typeof testIdentity>>;
let ec: typeof rsa;
const now = new Date('2026-11-05T00:00:00Z');
const content = Buffer.from('hello — iPhone');

it('supports expired hardware identities only when a dedicated device issuer is explicitly pinned', async () => {
  const issuer = await createTestCa();
  issuer.certificate.notBefore.value = new Date('2007-01-01T00:00:00Z');
  issuer.certificate.notAfter.value = new Date('2014-01-01T00:00:00Z');
  await issuer.certificate.sign(issuer.privateKey, 'SHA-256');
  const leaf = await testIdentity('RSA', issuer);
  leaf.certificate.notBefore.value = new Date('2010-01-01T00:00:00Z');
  leaf.certificate.notAfter.value = new Date('2013-01-01T00:00:00Z');
  await leaf.certificate.sign(issuer.privateKey, 'SHA-256');
  const der = await signCms(content, leaf);
  await expect(verifyCms(der, { anchors: [issuer.certificate] })).rejects.toBeInstanceOf(CmsError);
  expect(
    (await verifyCms(der, { anchors: [issuer.certificate], purpose: 'apple-device' })).content,
  ).toEqual(content);
});

beforeAll(async () => {
  root = await createTestCa();
  otherRoot = await createTestCa();
  rsa = await testIdentity('RSA', root);
  ec = await testIdentity('ECDSA', root);
});

function parse(der: Buffer) {
  const info = ContentInfo.fromBER(Uint8Array.from(der));
  return new SignedData({ schema: info.content });
}

function encode(data: SignedData) {
  return Buffer.from(
    new ContentInfo({ contentType: ContentInfo.SIGNED_DATA, content: data.toSchema(true) })
      .toSchema()
      .toBER(false),
  );
}

async function issuedCa(name: string, issuer: typeof root, pathLenConstraint?: number) {
  const ca = await createTestCa();
  const cn = ca.certificate.subject.typesAndValues[0];
  if (!cn) throw new Error('Missing test CA name');
  cn.value = new asn1js.Utf8String({ value: name });
  ca.certificate.issuer = issuer.certificate.subject;
  ca.certificate.extensions?.splice(
    0,
    1,
    new Extension({
      extnID: '2.5.29.19',
      critical: true,
      extnValue: new BasicConstraints({
        cA: true,
        ...(pathLenConstraint === undefined ? {} : { pathLenConstraint }),
      })
        .toSchema()
        .toBER(false),
    }),
  );
  await ca.certificate.sign(issuer.privateKey, 'SHA-256');
  ca.chain = [issuer.certificate, ...issuer.chain];
  return ca;
}

describe('enrollment CMS', () => {
  it.each(['', 'abc'])(
    'emits attached primitive DER content and CMS signer version 1: %j',
    async (text) => {
      const der = await signCms(Buffer.from(text), rsa);
      const data = parse(der);
      expect(data.signerInfos[0]?.version).toBe(1);
      expect(data.encapContentInfo.eContent?.idBlock.isConstructed).toBe(false);
      const certs = data.certificates?.map((c) => Buffer.from(c.toSchema().toBER(false))) ?? [];
      expect(certs).toEqual([...certs].sort(Buffer.compare));
      expect((await verifyCms(der, { anchors: [root.certificate], now })).content.toString()).toBe(
        text,
      );
    },
  );

  it('rejects cyclic issuers without unbounded chain traversal', async () => {
    const a = await issuedCa('A', root);
    const b = await issuedCa('B', a);
    a.certificate.issuer = b.certificate.subject;
    await a.certificate.sign(b.privateKey, 'SHA-256');
    const leaf = await testIdentity('RSA', b);
    leaf.chain = [b.certificate, a.certificate];
    const der = await signCms(content, leaf);
    const original = CertificateChainValidationEngine.prototype.defaultFindIssuer;
    let calls = 0;
    const guard = vi
      .spyOn(CertificateChainValidationEngine.prototype, 'defaultFindIssuer')
      .mockImplementation(async function (this: CertificateChainValidationEngine, ...args) {
        if (++calls > 20) throw new Error('Test traversal breaker');
        return original.apply(this, args);
      });
    try {
      await expect(verifyCms(der, { anchors: [root.certificate], now })).rejects.toThrow(CmsError);
      expect(calls).toBeLessThan(20);
    } finally {
      guard.mockRestore();
    }
  });

  it('rejects a subordinate CA below a path-length-zero CA', async () => {
    const a = await issuedCa('A', root, 0);
    const b = await issuedCa('B', a);
    const leaf = await testIdentity('RSA', b);
    await expect(
      verifyCms(await signCms(content, leaf), { anchors: [root.certificate], now }),
    ).rejects.toThrow(CmsError);
  });

  it('accepts a leaf issued directly by a path-length-zero CA', async () => {
    const a = await issuedCa('A', root, 0);
    const leaf = await testIdentity('RSA', a);
    expect(
      (await verifyCms(await signCms(content, leaf), { anchors: [root.certificate], now })).content,
    ).toEqual(content);
  });

  it.each(['non-signing key usage', 'unknown critical extension'])(
    'rejects a leaf with %s',
    async (kind) => {
      const leaf = await testIdentity('RSA', root);
      if (kind === 'non-signing key usage') {
        leaf.certificate.extensions?.splice(
          1,
          1,
          new Extension({
            extnID: '2.5.29.15',
            critical: true,
            extnValue: new asn1js.BitString({
              unusedBits: 5,
              valueHex: new Uint8Array([0x20]),
            }).toBER(false),
          }),
        );
      } else {
        leaf.certificate.extensions?.push(
          new Extension({
            extnID: '1.2.3.4.5.6.7',
            critical: true,
            extnValue: new asn1js.Null().toBER(false),
          }),
        );
      }
      await leaf.certificate.sign(root.privateKey, 'SHA-256');
      await expect(
        verifyCms(await signCms(content, leaf), { anchors: [root.certificate], now }),
      ).rejects.toThrow(CmsError);
    },
  );
  it.each(['RSA', 'ECDSA'] as const)(
    'signs and verifies %s with SHA-256 and the full chain',
    async (kind) => {
      const identity = kind === 'RSA' ? rsa : ec;
      const der = await signCms(content, identity);
      const verified = await verifyCms(der, { anchors: [root.certificate], now });
      expect(verified.content).toEqual(content);
      expect(Buffer.from(verified.signer.toSchema(true).toBER(false))).toEqual(
        Buffer.from(identity.certificate.toSchema(true).toBER(false)),
      );
      const signed = parse(der);
      expect(signed.certificates).toHaveLength(2);
      expect(signed.digestAlgorithms[0]?.algorithmId).toBe('2.16.840.1.101.3.4.2.1');
      expect(signed.signerInfos[0]?.signedAttrs?.attributes.map((a) => a.type)).toEqual(
        expect.arrayContaining(['1.2.840.113549.1.9.3', '1.2.840.113549.1.9.4']),
      );
    },
  );

  it('validates through an intermediate supplied in the CMS', async () => {
    const intermediate = await createTestCa();
    intermediate.certificate.issuer = root.certificate.subject;
    await intermediate.certificate.sign(root.privateKey, 'SHA-256');
    intermediate.chain = [root.certificate];
    const leaf = await testIdentity('RSA', intermediate);
    expect(
      (await verifyCms(await signCms(content, leaf), { anchors: [root.certificate], now })).content,
    ).toEqual(content);
  });

  it('rejects an embedded but untrusted root', async () => {
    await expect(
      verifyCms(await signCms(content, rsa), { anchors: [otherRoot.certificate], now }),
    ).rejects.toThrow(CmsError);
  });

  it('requires explicit trust anchors', async () => {
    await expect(verifyCms(await signCms(content, rsa), { anchors: [], now })).rejects.toThrow(
      CmsError,
    );
  });

  it('rejects tampered attached content', async () => {
    const signed = parse(await signCms(content, rsa));
    signed.encapContentInfo.eContent = new asn1js.OctetString({
      valueHex: Buffer.from('tampered'),
    });
    await expect(verifyCms(encode(signed), { anchors: [root.certificate], now })).rejects.toThrow(
      CmsError,
    );
  });

  it('rejects ambiguous signers even if each signature is valid', async () => {
    const signed = parse(await signCms(content, rsa));
    const signer = signed.signerInfos[0];
    if (!signer) throw new Error('Missing test signer');
    signed.signerInfos.push(signer);
    await expect(verifyCms(encode(signed), { anchors: [root.certificate], now })).rejects.toThrow(
      CmsError,
    );
  });

  it.each(['wrong type', 'duplicate digest'])(
    'rejects correctly signed but invalid attributes: %s',
    async (kind) => {
      const signed = parse(await signCms(content, rsa));
      const attrs = signed.signerInfos[0]?.signedAttrs;
      if (!attrs) throw new Error('Missing test attributes');
      if (kind === 'wrong type') {
        const attr = attrs.attributes.find((a) => a.type === '1.2.840.113549.1.9.3');
        if (!attr) throw new Error('Missing test content type');
        attr.values = [new asn1js.ObjectIdentifier({ value: ContentInfo.SIGNED_DATA })];
      } else {
        const digest = attrs.attributes.find((a) => a.type === '1.2.840.113549.1.9.4');
        if (!digest) throw new Error('Missing test digest');
        attrs.attributes.push(digest);
      }
      attrs.encodedValue = new ArrayBuffer(0);
      await signed.sign(rsa.privateKey, 0, 'SHA-256');
      await expect(verifyCms(encode(signed), { anchors: [root.certificate], now })).rejects.toThrow(
        CmsError,
      );
    },
  );

  it('rejects a modified signature', async () => {
    const signed = parse(await signCms(content, rsa));
    const signature = signed.signerInfos[0]?.signature.valueBlock.valueHexView;
    if (!signature) throw new Error('Missing test signature');
    signature[0] = (signature[0] ?? 0) ^ 1;
    await expect(verifyCms(encode(signed), { anchors: [root.certificate], now })).rejects.toThrow(
      CmsError,
    );
  });

  it.each(['2024-01-01', '2036-01-01'])('rejects certificates invalid on %s', async (date) => {
    await expect(
      verifyCms(await signCms(content, rsa), { anchors: [root.certificate], now: new Date(date) }),
    ).rejects.toThrow(CmsError);
  });

  it('rejects a missing intermediate', async () => {
    const intermediate = await issuedCa('Intermediate', root);
    const leaf = await testIdentity('RSA', intermediate);
    const signed = parse(await signCms(content, leaf));
    signed.certificates = [leaf.certificate, root.certificate];
    await expect(verifyCms(encode(signed), { anchors: [root.certificate], now })).rejects.toThrow(
      CmsError,
    );
  });

  it('rejects missing signers, detached content and missing signed attributes', async () => {
    for (const field of ['signer', 'content', 'attributes']) {
      const signed = parse(await signCms(content, rsa));
      if (field === 'signer') signed.signerInfos = [];
      if (field === 'content') delete signed.encapContentInfo.eContent;
      if (field === 'attributes' && signed.signerInfos[0]) delete signed.signerInfos[0].signedAttrs;
      await expect(verifyCms(encode(signed), { anchors: [root.certificate], now })).rejects.toThrow(
        CmsError,
      );
    }
  });

  it('rejects malformed CMS and trailing bytes with a safe error', async () => {
    for (const data of [
      Buffer.from('not CMS — private input'),
      Buffer.concat([await signCms(content, rsa), Buffer.from([0])]),
    ]) {
      await expect(verifyCms(data, { anchors: [root.certificate], now })).rejects.toThrow(CmsError);
      await expect(verifyCms(data, { anchors: [root.certificate], now })).rejects.not.toThrow(
        'private input',
      );
    }
  });

  const openssl =
    process.env.OPENSSL_BIN ??
    (process.platform === 'win32' && existsSync('C:/Program Files/Git/usr/bin/openssl.exe')
      ? 'C:/Program Files/Git/usr/bin/openssl.exe'
      : 'openssl');
  const hasOpenSsl = spawnSync(openssl, ['version']).status === 0;

  it.skipIf(!hasOpenSsl).each([false, true])(
    'verifies OpenSSL input, streaming BER=%s',
    async (streaming) => {
      const dir = await mkdtemp(join(tmpdir(), 'xstore-cms-test-'));
      try {
        await writeFile(join(dir, 'leaf.pem'), certPem(rsa.certificate));
        await writeFile(join(dir, 'root.pem'), certPem(root.certificate));
        await writeFile(join(dir, 'key.pem'), await keyPem(rsa.privateKey));
        await writeFile(join(dir, 'payload'), content);
        execFileSync(
          openssl,
          [
            'cms',
            '-sign',
            '-binary',
            '-nodetach',
            '-md',
            'sha256',
            '-outform',
            'DER',
            '-in',
            join(dir, 'payload'),
            '-out',
            join(dir, 'openssl.der'),
            '-signer',
            join(dir, 'leaf.pem'),
            '-inkey',
            join(dir, 'key.pem'),
            '-certfile',
            join(dir, 'root.pem'),
            ...(streaming ? ['-stream'] : []),
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        const verified = await verifyCms(await readFile(join(dir, 'openssl.der')), {
          anchors: [root.certificate],
          now,
        });
        expect(verified.content).toEqual(content);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(!hasOpenSsl).each(['RSA', 'ECDSA'] as const)(
    'OpenSSL independently verifies %s output',
    async (kind) => {
      const dir = await mkdtemp(join(tmpdir(), 'xstore-cms-test-'));
      try {
        await writeFile(join(dir, 'root.pem'), certPem(root.certificate));
        await writeFile(join(dir, 'signed.der'), await signCms(content, kind === 'RSA' ? rsa : ec));
        const verified = execFileSync(
          openssl,
          [
            'cms',
            '-verify',
            '-binary',
            '-inform',
            'DER',
            '-in',
            join(dir, 'signed.der'),
            '-CAfile',
            join(dir, 'root.pem'),
            '-purpose',
            'any',
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        expect(verified).toEqual(content);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
});
