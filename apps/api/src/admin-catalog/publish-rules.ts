import { type AppForPublish, appPublishBlockers } from '@xstore/db';
import type { PublishBlocker, VersionPublishBlocker } from '@xstore/shared';

export type { AppForPublish };

/** Everything that keeps an app out of the catalog (spec 2026-11-24 §3). */
export function publishBlockers(app: AppForPublish): PublishBlocker[] {
  return appPublishBlockers(app);
}

/** A FairPlay-encrypted IPA cannot be signed, so its version never goes public. */
export function versionPublishBlockers(version: { encrypted: boolean }): VersionPublishBlocker[] {
  return version.encrypted ? ['ENCRYPTED'] : [];
}
