import type { AppSection, AppStatus, Prisma } from './generated/prisma/client.js';

/** Why an app cannot go into the catalog (same codes as `PublishBlocker` in `@xstore/shared`). */
export type AppPublishBlocker = 'NO_SECTION' | 'NO_CATEGORY' | 'NO_ICON' | 'NO_VERSION';

export type AppForPublish = {
  section: AppSection | null;
  categoryId: string | null;
  iconKey: string | null;
  /** Versions that can be signed (not FairPlay-encrypted). */
  usableVersions: number;
};

/** Everything that keeps an app out of the catalog (owner 2026-11-24: no card, no rights text). */
export function appPublishBlockers(app: AppForPublish): AppPublishBlocker[] {
  const out: AppPublishBlocker[] = [];
  if (!app.section) out.push('NO_SECTION');
  if (!app.categoryId) out.push('NO_CATEGORY');
  if (!app.iconKey) out.push('NO_ICON');
  if (app.usableVersions < 1) out.push('NO_VERSION');
  return out;
}

export type SyncResult = { status: AppStatus; blockers: AppPublishBlocker[] };

/**
 * Brings an app in line with the simple-upload rules (spec 2026-11-24 §3): the newest unencrypted
 * version is the published one, and the app is in the catalog exactly when nothing is missing.
 * A hidden app stays hidden. Call inside the transaction that changed the app or its versions.
 */
export async function syncAppPublication(
  tx: Prisma.TransactionClient,
  appId: string,
): Promise<SyncResult> {
  const app = await tx.app.findUniqueOrThrow({
    where: { id: appId },
    select: { status: true, section: true, categoryId: true, iconKey: true },
  });
  const newest = await tx.appVersion.findFirst({
    where: { appId, encrypted: false, status: { not: 'rejected' } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, status: true },
  });
  const blockers = appPublishBlockers({ ...app, usableVersions: newest ? 1 : 0 });

  if (newest) {
    await tx.appVersion.updateMany({
      where: { appId, status: 'published', id: { not: newest.id } },
      data: { status: 'draft' },
    });
    if (newest.status !== 'published') {
      await tx.appVersion.update({
        where: { id: newest.id },
        data: { status: 'published', publishedAt: new Date() },
      });
    }
  }

  let status = app.status;
  if (status !== 'hidden') status = blockers.length === 0 ? 'published' : 'draft';
  await tx.app.update({
    where: { id: appId },
    data: {
      status,
      removedFromAppStore: app.section === 'removed',
      ...(status !== 'hidden' && { hiddenReason: null }),
    },
  });
  return { status, blockers };
}
