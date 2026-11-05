import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@xstore/db';
import {
  type AdminAppDetail,
  type AdminAppListItem,
  type AdminAppsQuery,
  type AdminVersion,
  ErrorCode,
  MAX_MEDIA_BYTES,
  MAX_SCREENSHOTS,
  type MediaKind,
  type MediaUploadTicket,
  mediaContentTypeSchema,
  type Page,
  type PresignMedia,
  type UpdateApp,
  type UpdateVersion,
} from '@xstore/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { PrismaService } from '../infra/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { publishBlockers, versionPublishBlockers } from './publish-rules.js';

/** Apps per page in the admin list. */
export const ADMIN_PAGE_SIZE = 50;

const notFound = (): DomainError => new DomainError(ErrorCode.NOT_FOUND, 404);
const conflict = (): DomainError => new DomainError(ErrorCode.CONFLICT, 409);
const invalid = (): DomainError => new DomainError(ErrorCode.VALIDATION, 400);

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg' } as const;

/** Keys the admin uploads: `apps/<appId>/<kind>-<32 hex>.<png|jpg>`. */
export function mediaKey(appId: string, kind: MediaKind, ext: 'png' | 'jpg'): string {
  return `apps/${appId}/${kind}-${randomBytes(16).toString('hex')}.${ext}`;
}

export function isMediaKeyOf(key: string, appId: string, kind: MediaKind): boolean {
  const escaped = appId.replace(/[^A-Za-z0-9_-]/g, '');
  return (
    escaped === appId && new RegExp(`^apps/${escaped}/${kind}-[a-f0-9]{32}\\.(png|jpg)$`).test(key)
  );
}

/** Only keys this API issued are deleted from the media bucket (worker icons stay). */
const isAdminMediaKey = (key: string): boolean =>
  /^apps\/[A-Za-z0-9_-]+\/(icon|banner|screenshot)-[a-f0-9]{32}\.(png|jpg)$/.test(key);

/** PNG or JPEG by magic bytes. */
export function sniffImage(head: Buffer): 'image/png' | 'image/jpeg' | null {
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  return null;
}

const DETAIL_SELECT = {
  id: true,
  slug: true,
  name: true,
  subtitle: true,
  description: true,
  developer: true,
  categoryId: true,
  rightsBasis: true,
  accessLevel: true,
  removedFromAppStore: true,
  status: true,
  hiddenReason: true,
  rating: true,
  ratingCount: true,
  languages: true,
  itunesId: true,
  iconKey: true,
  bannerKey: true,
  screenshotKeys: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { versions: { where: { status: 'published' } } } },
} satisfies Prisma.AppSelect;

type DetailRow = Prisma.AppGetPayload<{ select: typeof DETAIL_SELECT }>;

type VersionRow = Prisma.AppVersionGetPayload<object>;

const listCursorSchema = z.object({ u: z.string(), i: z.string() });

function decodeListCursor(raw: string | undefined): z.infer<typeof listCursorSchema> | undefined {
  if (!raw) return undefined;
  try {
    return listCursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
  } catch {
    throw invalid();
  }
}

/** Fields of a PATCH that really changed, as `{ field: { from, to } }`. */
function changes(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [field, to] of Object.entries(patch)) {
    const from = before[field] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) out[field] = { from, to };
  }
  return out;
}

@Injectable()
export class AdminAppsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async list(query: AdminAppsQuery): Promise<Page<AdminAppListItem>> {
    const cursor = decodeListCursor(query.cursor);
    const q = query.q?.trim();
    const where: Prisma.AppWhereInput = {
      ...(query.status && { status: query.status }),
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { slug: { contains: q, mode: 'insensitive' } },
          { developer: { contains: q, mode: 'insensitive' } },
          { versions: { some: { bundleId: { contains: q, mode: 'insensitive' } } } },
        ],
      }),
      ...(cursor && {
        AND: [
          {
            OR: [
              { updatedAt: { lt: new Date(cursor.u) } },
              { updatedAt: new Date(cursor.u), id: { lt: cursor.i } },
            ],
          },
        ],
      }),
    };
    const rows = await this.db.app.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: ADMIN_PAGE_SIZE + 1,
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        iconKey: true,
        updatedAt: true,
        category: { select: { id: true, name: true } },
        versions: { orderBy: { createdAt: 'desc' }, take: 1, select: { version: true } },
      },
    });
    const page = rows.slice(0, ADMIN_PAGE_SIZE);
    const last = page.at(-1);
    return {
      items: page.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        status: r.status,
        iconUrl: r.iconKey ? this.storage.mediaUrl(r.iconKey) : null,
        category: r.category,
        latestVersion: r.versions[0]?.version ?? null,
        updatedAt: r.updatedAt.toISOString(),
      })),
      nextCursor:
        rows.length > ADMIN_PAGE_SIZE && last
          ? Buffer.from(JSON.stringify({ u: last.updatedAt.toISOString(), i: last.id })).toString(
              'base64url',
            )
          : null,
    };
  }

  async get(id: string): Promise<AdminAppDetail> {
    return this.detail(await this.find(id));
  }

  async update(id: string, patch: UpdateApp, actor: Actor): Promise<AdminAppDetail> {
    const before = await this.find(id);
    if (patch.categoryId) {
      const category = await this.db.category.findUnique({ where: { id: patch.categoryId } });
      if (!category) throw invalid();
    }
    const diff = changes(before, patch);
    if (Object.keys(diff).length === 0) return this.detail(before);
    let row: DetailRow;
    try {
      row = await this.db.app.update({ where: { id }, data: patch, select: DETAIL_SELECT });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict();
      throw err;
    }
    await this.record(actor, 'app.update', id, diff);
    return this.detail(row);
  }

  async publish(id: string, actor: Actor): Promise<AdminAppDetail> {
    const row = await this.find(id);
    this.assertPublishable(row);
    const updated = await this.setStatus(id, 'published', null);
    await this.record(actor, 'app.publish', id, { from: row.status });
    return this.detail(updated);
  }

  async hide(id: string, reason: string, actor: Actor): Promise<AdminAppDetail> {
    const row = await this.find(id);
    const updated = await this.setStatus(id, 'hidden', reason);
    await this.record(actor, 'app.hide', id, { from: row.status, reason });
    return this.detail(updated);
  }

  /** A hidden app goes back to the public catalog, provided it is still publishable. */
  async unhide(id: string, actor: Actor): Promise<AdminAppDetail> {
    const row = await this.find(id);
    if (row.status !== 'hidden') throw conflict();
    this.assertPublishable(row);
    const updated = await this.setStatus(id, 'published', null);
    await this.record(actor, 'app.unhide', id, { reason: row.hiddenReason });
    return this.detail(updated);
  }

  async presignMedia(id: string, kind: MediaKind, input: PresignMedia): Promise<MediaUploadTicket> {
    const row = await this.find(id);
    if (kind === 'screenshot' && row.screenshotKeys.length >= MAX_SCREENSHOTS) throw invalid();
    const key = mediaKey(id, kind, EXT[input.contentType]);
    const url = await this.storage.presignPutObject(
      this.storage.bucket('media'),
      key,
      input.contentType,
    );
    return { key, url };
  }

  /** Checks the uploaded object (our key, ≤ 5 MB, real PNG/JPEG) and attaches it to the card. */
  async commitMedia(
    id: string,
    kind: MediaKind,
    key: string,
    actor: Actor,
  ): Promise<AdminAppDetail> {
    const row = await this.find(id);
    if (!isMediaKeyOf(key, id, kind)) throw invalid();
    const bucket = this.storage.bucket('media');
    const head = await this.storage.headObject(bucket, key);
    if (!head) throw invalid();
    const declared = mediaContentTypeSchema.safeParse(head.contentType);
    const sniffed = sniffImage(await this.storage.readStart(bucket, key, 8));
    if (head.size > MAX_MEDIA_BYTES || !declared.success || sniffed !== declared.data) {
      await this.storage.deleteObject(bucket, key);
      throw invalid();
    }
    let data: Prisma.AppUpdateInput;
    let replaced: string | null = null;
    if (kind === 'screenshot') {
      if (row.screenshotKeys.includes(key)) return this.detail(row);
      if (row.screenshotKeys.length >= MAX_SCREENSHOTS) throw invalid();
      data = { screenshotKeys: [...row.screenshotKeys, key] };
    } else if (kind === 'icon') {
      replaced = row.iconKey;
      data = { iconKey: key };
    } else {
      replaced = row.bannerKey;
      data = { bannerKey: key };
    }
    const updated = await this.db.app.update({ where: { id }, data, select: DETAIL_SELECT });
    if (replaced && replaced !== key && isAdminMediaKey(replaced))
      await this.storage.deleteObject(bucket, replaced);
    await this.record(actor, 'app.media', id, { kind, key, replaced });
    return this.detail(updated);
  }

  async deleteScreenshot(id: string, index: number, actor: Actor): Promise<AdminAppDetail> {
    const row = await this.find(id);
    const key = row.screenshotKeys[index];
    if (key === undefined) throw notFound();
    const keys = row.screenshotKeys.filter((_, i) => i !== index);
    const updated = await this.db.app.update({
      where: { id },
      data: { screenshotKeys: keys },
      select: DETAIL_SELECT,
    });
    if (isAdminMediaKey(key)) await this.storage.deleteObject(this.storage.bucket('media'), key);
    await this.record(actor, 'app.screenshot_delete', id, { key });
    return this.detail(updated);
  }

  /** `keys` must be the current screenshots, each once, in the new order. */
  async orderScreenshots(id: string, keys: string[], actor: Actor): Promise<AdminAppDetail> {
    const row = await this.find(id);
    const current = new Set(row.screenshotKeys);
    if (keys.length !== current.size || keys.some((k) => !current.has(k))) throw invalid();
    const updated = await this.db.app.update({
      where: { id },
      data: { screenshotKeys: keys },
      select: DETAIL_SELECT,
    });
    await this.record(actor, 'app.screenshot_order', id, { from: row.screenshotKeys, to: keys });
    return this.detail(updated);
  }

  async versions(appId: string): Promise<AdminVersion[]> {
    await this.find(appId);
    const rows = await this.db.appVersion.findMany({
      where: { appId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((v) => this.version(v));
  }

  async publishVersion(id: string, actor: Actor): Promise<AdminVersion> {
    const row = await this.findVersion(id);
    const blockers = versionPublishBlockers(row);
    if (blockers.length > 0) throw new DomainError(ErrorCode.PUBLISH_BLOCKED, 409, blockers);
    if (row.status === 'rejected') throw conflict();
    const updated = await this.db.appVersion.update({
      where: { id },
      data: { status: 'published', publishedAt: new Date() },
    });
    await this.recordVersion(actor, 'version.publish', updated);
    return this.version(updated);
  }

  async unpublishVersion(id: string, actor: Actor): Promise<AdminVersion> {
    const row = await this.findVersion(id);
    if (row.status !== 'published') throw conflict();
    const updated = await this.db.appVersion.update({
      where: { id },
      data: { status: 'draft', publishedAt: null },
    });
    await this.recordVersion(actor, 'version.unpublish', updated);
    return this.version(updated);
  }

  async updateVersion(id: string, patch: UpdateVersion, actor: Actor): Promise<AdminVersion> {
    const row = await this.findVersion(id);
    const updated = await this.db.appVersion.update({ where: { id }, data: patch });
    await this.recordVersion(actor, 'version.update', updated, changes(row, patch));
    return this.version(updated);
  }

  private assertPublishable(row: DetailRow): void {
    const blockers = publishBlockers({
      rightsBasis: row.rightsBasis,
      iconKey: row.iconKey,
      categoryId: row.categoryId,
      publishedVersions: row._count.versions,
    });
    if (blockers.length > 0) throw new DomainError(ErrorCode.PUBLISH_BLOCKED, 409, blockers);
  }

  private setStatus(
    id: string,
    status: 'published' | 'hidden',
    hiddenReason: string | null,
  ): Promise<DetailRow> {
    return this.db.app.update({
      where: { id },
      data: { status, hiddenReason },
      select: DETAIL_SELECT,
    });
  }

  private async find(id: string): Promise<DetailRow> {
    const row = await this.db.app.findUnique({ where: { id }, select: DETAIL_SELECT });
    if (!row) throw notFound();
    return row;
  }

  private async findVersion(id: string): Promise<VersionRow> {
    const row = await this.db.appVersion.findUnique({ where: { id } });
    if (!row) throw notFound();
    return row;
  }

  private record(actor: Actor, action: string, entityId: string, diff?: unknown): Promise<void> {
    return this.audit.record({
      actorId: actor.userId,
      action,
      entity: 'App',
      entityId,
      diff,
      ip: actor.ip,
    });
  }

  private recordVersion(
    actor: Actor,
    action: string,
    row: VersionRow,
    diff?: unknown,
  ): Promise<void> {
    return this.audit.record({
      actorId: actor.userId,
      action,
      entity: 'AppVersion',
      entityId: row.id,
      diff: diff ?? { appId: row.appId, version: row.version, build: row.build },
      ip: actor.ip,
    });
  }

  private detail(row: DetailRow): AdminAppDetail {
    const { _count, iconKey, bannerKey, screenshotKeys, createdAt, updatedAt, ...card } = row;
    return {
      ...card,
      iconUrl: iconKey ? this.storage.mediaUrl(iconKey) : null,
      bannerUrl: bannerKey ? this.storage.mediaUrl(bannerKey) : null,
      screenshots: screenshotKeys.map((key) => ({ key, url: this.storage.mediaUrl(key) })),
      publishBlockers: publishBlockers({
        rightsBasis: row.rightsBasis,
        iconKey,
        categoryId: row.categoryId,
        publishedVersions: _count.versions,
      }),
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    };
  }

  private version(v: VersionRow): AdminVersion {
    return {
      id: v.id,
      version: v.version,
      build: v.build,
      bundleId: v.bundleId,
      minIos: v.minIos,
      sizeBytes: Number(v.sizeBytes),
      encrypted: v.encrypted,
      status: v.status,
      changelog: v.changelog,
      publishedAt: v.publishedAt?.toISOString() ?? null,
      createdAt: v.createdAt.toISOString(),
    };
  }
}
