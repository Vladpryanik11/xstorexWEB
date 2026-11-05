import { type IpaUpload, Prisma } from '@xstore/db';
import { type IpaInspect, ipaInspectSchema, slugify, uniqueSlug } from '@xstore/shared';
import type { WorkerDeps } from '../deps.js';

export type AttachResult =
  | { status: 'attached'; appId: string; versionId: string; created: boolean }
  | { status: 'duplicate' };

/** Where `ipa:inspect` puts the icons of an upload in the media bucket. */
export function uploadIconKeys(uploadId: string): { icon512Key: string; icon57Key: string } {
  return {
    icon512Key: `uploads/${uploadId}/icon-512.png`,
    icon57Key: `uploads/${uploadId}/icon-57.png`,
  };
}

export const appIconKey = (appId: string) => `apps/${appId}/icon-512.png`;
export const versionIconKey = (appId: string, versionId: string) =>
  `apps/${appId}/${versionId}/icon-57.png`;

class AttachRaceError extends Error {
  constructor(uploadId: string) {
    super(`upload ${uploadId} was attached or changed concurrently`);
    this.name = 'AttachRaceError';
  }
}

/**
 * Copies the upload-scoped icons to the keys recorded in `inspect` and removes the upload-scoped
 * copies. Safe to repeat: a missing source means an earlier run already moved it.
 */
async function moveIcons(deps: WorkerDeps, uploadId: string, inspect: IpaInspect): Promise<void> {
  const media = deps.s3.bucket('media');
  const from = uploadIconKeys(uploadId);
  for (const [source, target] of [
    [from.icon512Key, inspect.icon512Key],
    [from.icon57Key, inspect.icon57Key],
  ] as const) {
    if (target && target !== source) await deps.s3.copy(media, source, target);
  }
  await deps.s3.remove(media, from.icon512Key);
  await deps.s3.remove(media, from.icon57Key);
}

async function rejectDuplicate(deps: WorkerDeps, upload: IpaUpload): Promise<AttachResult> {
  const media = deps.s3.bucket('media');
  const icons = uploadIconKeys(upload.id);
  await deps.s3.remove(upload.bucket, upload.key);
  await deps.s3.remove(media, icons.icon512Key);
  await deps.s3.remove(media, icons.icon57Key);
  await deps.db.ipaUpload.updateMany({
    where: { id: upload.id, status: 'ready', appVersionId: null },
    data: { status: 'rejected', rejectCode: 'DUPLICATE_VERSION' },
  });
  deps.logger.info({ uploadId: upload.id }, 'duplicate version rejected');
  return { status: 'duplicate' };
}

/**
 * Turns an inspected catalog upload into an `AppVersion`: a new version of the app that already
 * has this bundle id, or a draft of a new app. The admin fills in the card by hand; nothing is
 * imported from iTunes (owner decision, 2026-11-05). A version that is already in the catalog
 * rejects the upload with `DUPLICATE_VERSION` and deletes its files.
 *
 * Idempotent: an upload that is already attached only gets its icons moved again.
 */
export async function attachToCatalog(deps: WorkerDeps, upload: IpaUpload): Promise<AttachResult> {
  if (upload.purpose !== 'catalog' || upload.status !== 'ready') {
    throw new Error(`upload ${upload.id} is not a ready catalog upload`);
  }
  const inspect = ipaInspectSchema.parse(upload.inspect);

  if (upload.appVersionId) {
    const version = await deps.db.appVersion.findUniqueOrThrow({
      where: { id: upload.appVersionId },
      select: { id: true, appId: true },
    });
    await moveIcons(deps, upload.id, inspect);
    return { status: 'attached', appId: version.appId, versionId: version.id, created: false };
  }

  let attached: { appId: string; versionId: string; created: boolean; inspect: IpaInspect } | null;
  try {
    attached = await deps.db.$transaction(async (tx) => {
      // Serialises uploads of one bundle id, so two first uploads cannot create two apps.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${inspect.bundleId}))`;

      const duplicate = await tx.appVersion.findUnique({
        where: {
          bundleId_version_build: {
            bundleId: inspect.bundleId,
            version: inspect.version,
            build: inspect.build,
          },
        },
        select: { id: true },
      });
      if (duplicate) return null;

      const existing = await tx.appVersion.findFirst({
        where: { bundleId: inspect.bundleId },
        orderBy: { createdAt: 'asc' },
        select: { app: { select: { id: true, iconKey: true } } },
      });
      let app = existing?.app;
      const created = !app;
      if (!app) {
        const slug = await uniqueSlug(slugify(inspect.name), async (candidate) =>
          Boolean(await tx.app.findUnique({ where: { slug: candidate }, select: { id: true } })),
        );
        app = await tx.app.create({
          data: { slug, name: inspect.name },
          select: { id: true, iconKey: true },
        });
      }

      const version = await tx.appVersion.create({
        data: {
          appId: app.id,
          version: inspect.version,
          build: inspect.build,
          bundleId: inspect.bundleId,
          minIos: inspect.minIos ?? null,
          sizeBytes: BigInt(inspect.sizeBytes),
          sha256: inspect.sha256,
          ipaKey: upload.key,
          encrypted: inspect.encrypted,
        },
        select: { id: true },
      });

      const icon57Key = inspect.icon57Key ? versionIconKey(app.id, version.id) : null;
      if (icon57Key) {
        await tx.appVersion.update({ where: { id: version.id }, data: { icon57Key } });
      }
      // The version's icon becomes the app icon only while the app has none.
      let icon512Key: string | null = null;
      if (inspect.icon512Key && !app.iconKey) {
        icon512Key = appIconKey(app.id);
        await tx.app.updateMany({
          where: { id: app.id, iconKey: null },
          data: { iconKey: icon512Key },
        });
      }

      const finalInspect: IpaInspect = { ...inspect, icon512Key, icon57Key };
      const linked = await tx.ipaUpload.updateMany({
        where: { id: upload.id, status: 'ready', appVersionId: null },
        data: { appVersionId: version.id, inspect: finalInspect },
      });
      if (linked.count !== 1) throw new AttachRaceError(upload.id);
      return { appId: app.id, versionId: version.id, created, inspect: finalInspect };
    });
  } catch (err) {
    // The unique index is the last line of defence against a duplicate version. Any other
    // unique clash (two new apps taking the same slug at once) is retried by BullMQ.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    const duplicate = await deps.db.appVersion.findUnique({
      where: {
        bundleId_version_build: {
          bundleId: inspect.bundleId,
          version: inspect.version,
          build: inspect.build,
        },
      },
      select: { id: true },
    });
    if (!duplicate) throw err;
    attached = null;
  }

  if (!attached) return rejectDuplicate(deps, upload);

  await moveIcons(deps, upload.id, attached.inspect);
  deps.logger.info(
    { uploadId: upload.id, appId: attached.appId, versionId: attached.versionId },
    attached.created ? 'new app drafted' : 'version added',
  );
  return {
    status: 'attached',
    appId: attached.appId,
    versionId: attached.versionId,
    created: attached.created,
  };
}
