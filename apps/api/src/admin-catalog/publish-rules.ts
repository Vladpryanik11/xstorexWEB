import type { PublishBlocker, VersionPublishBlocker } from '@xstore/shared';

export type AppForPublish = {
  rightsBasis: string | null;
  iconKey: string | null;
  categoryId: string | null;
  /** Versions with status `published`. */
  publishedVersions: number;
};

/** Everything that keeps an app from being published; an app publishes only with none. */
export function publishBlockers(app: AppForPublish): PublishBlocker[] {
  const out: PublishBlocker[] = [];
  if (!app.rightsBasis?.trim()) out.push('NO_RIGHTS_BASIS');
  if (!app.iconKey) out.push('NO_ICON');
  if (app.publishedVersions < 1) out.push('NO_PUBLISHED_VERSION');
  if (!app.categoryId) out.push('NO_CATEGORY');
  return out;
}

/** A FairPlay-encrypted IPA cannot be signed, so its version never goes public. */
export function versionPublishBlockers(version: { encrypted: boolean }): VersionPublishBlocker[] {
  return version.encrypted ? ['ENCRYPTED'] : [];
}
