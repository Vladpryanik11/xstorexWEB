import { Inject, Injectable } from '@nestjs/common';
import type { IpaUpload, Prisma } from '@xstore/db';
import {
  type CompleteUpload,
  type CreateUpload,
  ErrorCode,
  type IpaInspectJob,
  type PresignedParts,
  QueueName,
  type UploadedParts,
  type UploadView,
} from '@xstore/shared';
import { AuditService } from '../audit/audit.service.js';
import { DomainError } from '../common/domain-error.js';
import { PrismaService } from '../infra/prisma.service.js';
import { QUEUES, type Queues } from '../infra/queues.provider.js';
import { isNoSuchUpload, StorageService } from '../storage/storage.service.js';
import { checkUploadedParts, MAX_UPLOAD_BYTES, PART_SIZE, planParts } from './plan-parts.js';

export type Actor = { userId: string; ip?: string };

const IPA_CONTENT_TYPE = 'application/octet-stream';

const notFound = (): DomainError => new DomainError(ErrorCode.NOT_FOUND, 404);
const conflict = (): DomainError => new DomainError(ErrorCode.CONFLICT, 409);
const invalid = (): DomainError => new DomainError(ErrorCode.VALIDATION, 400);

/** ETags compare without the surrounding quotes some clients drop. */
const bareEtag = (etag: string): string => etag.replace(/^"|"$/g, '');

export function toUploadView(row: IpaUpload): UploadView {
  return {
    id: row.id,
    fileName: row.fileName,
    sizeBytes: Number(row.sizeBytes),
    partSize: row.partSize,
    status: row.status,
    ...(row.rejectCode ? { rejectCode: row.rejectCode } : {}),
    ...(row.inspect !== null ? { inspect: row.inspect } : {}),
  };
}

/** Admin catalog uploads: resumable multipart uploads straight to the originals bucket. */
@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    @Inject(QUEUES) private readonly queues: Queues,
  ) {}

  async create(input: CreateUpload, actor: Actor): Promise<UploadView> {
    if (input.sizeBytes > MAX_UPLOAD_BYTES) throw new DomainError(ErrorCode.UPLOAD_TOO_LARGE, 400);
    const bucket = this.storage.bucket('originals');
    const db = this.prisma.client;
    const created = await db.ipaUpload.create({
      data: {
        ownerId: actor.userId,
        purpose: 'catalog',
        bucket,
        key: '',
        fileName: input.fileName,
        sizeBytes: BigInt(input.sizeBytes),
        partSize: PART_SIZE,
      },
    });
    const key = `originals/${created.id}.ipa`;
    let s3UploadId: string;
    try {
      s3UploadId = await this.storage.createMultipart(bucket, key, IPA_CONTENT_TYPE);
    } catch (err) {
      await db.ipaUpload.delete({ where: { id: created.id } });
      throw err;
    }
    const row = await db.ipaUpload.update({
      where: { id: created.id },
      data: { key, s3UploadId },
    });
    await this.audit.record({
      actorId: actor.userId,
      action: 'upload.create',
      entity: 'IpaUpload',
      entityId: row.id,
      diff: { fileName: row.fileName, sizeBytes: input.sizeBytes },
      ip: actor.ip,
    });
    return toUploadView(row);
  }

  async get(id: string): Promise<UploadView> {
    const row = await this.find(id);
    const version = row.appVersionId
      ? await this.prisma.client.appVersion.findUnique({
          where: { id: row.appVersionId },
          select: { appId: true },
        })
      : null;
    return {
      ...toUploadView(row),
      // The worker's internal ready checkpoint precedes catalog attachment (and duplicate rejection).
      status: row.status === 'ready' && !version ? 'inspecting' : row.status,
      ...(version ? { appId: version.appId } : {}),
    };
  }

  async presignParts(id: string, partNumbers: number[]): Promise<PresignedParts> {
    const row = await this.inProgress(id);
    const count = planParts(Number(row.sizeBytes), row.partSize);
    if (partNumbers.some((n) => n > count)) throw invalid();
    const urls = await Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await this.storage.presignPut(row.bucket, row.key, row.s3UploadId, partNumber),
      })),
    );
    return { urls };
  }

  async listParts(id: string): Promise<UploadedParts> {
    const row = await this.inProgress(id);
    try {
      return { parts: await this.storage.listParts(row.bucket, row.key, row.s3UploadId) };
    } catch (err) {
      if (isNoSuchUpload(err)) throw conflict();
      throw err;
    }
  }

  async complete(id: string, input: CompleteUpload, actor: Actor): Promise<UploadView> {
    const row = await this.find(id);
    // A retried complete (lost response) re-enqueues idempotently instead of failing.
    if (row.status === 'uploaded') {
      await this.enqueueInspect(row.id);
      await this.audit.record({
        actorId: actor.userId,
        action: 'upload.complete',
        entity: 'IpaUpload',
        entityId: row.id,
        diff: { recovered: true },
        ip: actor.ip,
      });
      return this.get(row.id);
    }
    // A lost complete response can be retried after the worker has already claimed the upload.
    if (row.status === 'inspecting' || row.status === 'ready') return this.get(row.id);
    const upload = this.requireInProgress(row);
    let listed: Awaited<ReturnType<StorageService['listParts']>>;
    try {
      listed = await this.storage.listParts(upload.bucket, upload.key, upload.s3UploadId);
    } catch (err) {
      if (isNoSuchUpload(err)) throw conflict();
      throw err;
    }
    if (!checkUploadedParts(listed, Number(upload.sizeBytes), upload.partSize)) throw invalid();
    const sent = new Map(input.parts.map((p) => [p.partNumber, bareEtag(p.etag)]));
    if (
      sent.size !== listed.length ||
      listed.some((p) => sent.get(p.partNumber) !== bareEtag(p.etag))
    )
      throw invalid();

    try {
      await this.storage.completeMultipart(upload.bucket, upload.key, upload.s3UploadId, listed);
    } catch (err) {
      if (isNoSuchUpload(err)) throw conflict();
      throw err;
    }
    const updated = await this.prisma.client.ipaUpload.updateMany({
      where: { id: upload.id, status: 'uploading' },
      data: { status: 'uploaded' },
    });
    if (updated.count === 0) throw conflict();
    await this.enqueueInspect(upload.id);
    await this.audit.record({
      actorId: actor.userId,
      action: 'upload.complete',
      entity: 'IpaUpload',
      entityId: upload.id,
      ip: actor.ip,
    });
    return this.get(upload.id);
  }

  async remove(id: string, actor: Actor): Promise<void> {
    const row = await this.find(id);
    // The original of a catalog version must never disappear under it.
    if (row.appVersionId) throw conflict();
    if (row.s3UploadId && row.status === 'uploading')
      await this.storage.abortMultipart(row.bucket, row.key, row.s3UploadId);
    if (row.key) await this.storage.deleteObject(row.bucket, row.key);
    await this.prisma.client.ipaUpload.delete({ where: { id: row.id } });
    await this.audit.record({
      actorId: actor.userId,
      action: 'upload.delete',
      entity: 'IpaUpload',
      entityId: row.id,
      diff: { fileName: row.fileName, status: row.status } satisfies Prisma.InputJsonValue,
      ip: actor.ip,
    });
  }

  private async enqueueInspect(uploadId: string): Promise<void> {
    const data: IpaInspectJob = { uploadId };
    // The fixed job id makes a repeated enqueue a no-op while the job exists.
    await this.queues[QueueName.ipa].add('inspect', data, { jobId: `inspect-${uploadId}` });
  }

  private async find(id: string): Promise<IpaUpload> {
    const row = await this.prisma.client.ipaUpload.findFirst({
      where: { id, purpose: 'catalog' },
    });
    if (!row) throw notFound();
    return row;
  }

  private async inProgress(id: string): Promise<IpaUpload & { s3UploadId: string }> {
    return this.requireInProgress(await this.find(id));
  }

  private requireInProgress(row: IpaUpload): IpaUpload & { s3UploadId: string } {
    if (row.status !== 'uploading' || !row.s3UploadId) throw conflict();
    return row as IpaUpload & { s3UploadId: string };
  }
}
