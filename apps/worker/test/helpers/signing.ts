import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CreateBucketCommand } from '@aws-sdk/client-s3';
import type { PrismaClient } from '@xstore/db';
import type { Keyring } from '@xstore/secrets';
import { encryptSecret } from '@xstore/secrets/encrypt';
import { makeKit, sha1Hex } from '@xstore/signing/testing';
import type { WorkerS3 } from '../../src/s3.js';

export async function ensureBuckets(s3: WorkerS3, names: Parameters<WorkerS3['bucket']>[0][]) {
  for (const name of names) {
    try {
      await s3.client.send(new CreateBucketCommand({ Bucket: s3.bucket(name) }));
    } catch (err) {
      const code = (err as { name?: string }).name;
      if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') throw err;
    }
  }
}

/**
 * A stand-in for zsign: records its argv to `<dir>/args-<n>.txt`, waits for `<dir>/go` when
 * `XSTORE_ZSIGN_WAIT` is in the script, then copies the input (last argument) to `-o`.
 */
export async function fakeZsign(opts: { wait?: boolean; fail?: boolean } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'fake-zsign-'));
  const bin = join(dir, 'zsign');
  await writeFile(
    bin,
    `#!/bin/sh
n=$(ls "${dir}" | grep -c '^args-')
printf '%s\\n' "$@" > "${dir}/args-$n.txt"
${opts.wait ? `while [ ! -f "${dir}/go" ]; do sleep 0.05; done` : ''}
${opts.fail ? 'echo "cannot sign" >&2; exit 2' : ''}
out=""; prev=""
for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; last="$a"; done
cp "$last" "$out"
`,
  );
  await chmod(bin, 0o755);
  return { dir, bin, go: () => writeFile(join(dir, 'go'), '') };
}

/** A buyer with an active device, its supplier files and a published app version. */
export async function seedSigning(
  db: PrismaClient,
  s3: WorkerS3,
  keyring: Keyring,
  opts: { appId?: string; certStatus?: 'active' | 'replaced' } = {},
) {
  const tag = randomBytes(4).toString('hex');
  const owner = await db.user.create({
    data: { role: 'admin', email: `owner-${tag}@xstorex.test` },
  });
  const user = await db.user.create({ data: { email: `buyer-${tag}@xstorex.test` } });
  const device = await db.device.create({
    data: {
      userId: user.id,
      udid: `00008110-${randomBytes(8).toString('hex').toUpperCase()}`,
      product: 'iPhone16,1',
      iosVersion: '22B83',
      name: 'iPhone 15 Pro',
      status: 'active',
    },
  });
  const kit = makeKit(opts.appId ? { appId: opts.appId } : {});
  const cert = await db.deviceCertificate.create({
    data: {
      deviceId: device.id,
      status: opts.certStatus ?? 'active',
      p12Enc: encryptSecret(kit.p12, keyring),
      p12PasswordEnc: encryptSecret(kit.password, keyring),
      profile: new Uint8Array(kit.profile),
      profileUuid: 'uuid',
      teamId: 'TEAM123456',
      appIdPattern: opts.appId ?? 'TEAM123456.*',
      certSerial: kit.certificate.serialNumber,
      certSha1: sha1Hex(kit.certificate.raw),
      certNotAfter: new Date(kit.certificate.validTo),
      profileExpiresAt: new Date(Date.now() + 300 * 86_400_000),
      uploadedById: owner.id,
    },
  });
  const app = await db.app.create({
    data: { slug: `app-${tag}`, name: 'Пример', status: 'published', rightsBasis: 'test' },
  });
  const ipaKey = `catalog/${tag}/original.ipa`;
  const ipa = Buffer.from(`fake ipa ${tag}`);
  await s3.put(s3.bucket('originals'), ipaKey, ipa, 'application/octet-stream');
  const version = await db.appVersion.create({
    data: {
      appId: app.id,
      version: '1.0',
      build: '1',
      bundleId: `com.example.${tag}`,
      sizeBytes: BigInt(ipa.length),
      sha256: 'x',
      ipaKey,
      encrypted: false,
      status: 'published',
      publishedAt: new Date(),
    },
  });
  return { owner, user, device, cert, app, version, kit, ipa };
}
