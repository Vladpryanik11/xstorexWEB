import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  type PutObjectCommandInput,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';
import { attachmentDisposition } from './content-disposition.js';
import { S3_CLIENTS, type S3Clients } from './s3.provider.js';

/** Presigned URLs live 15 minutes (spec §8). */
export const PRESIGN_TTL_SEC = 900;

export type BucketName = 'originals' | 'media' | 'signed' | 'uploads';
const BUCKETS: BucketName[] = ['originals', 'media', 'signed', 'uploads'];

export type StoredPart = { partNumber: number; etag: string; size: number };

function errorName(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'name' in err ? String(err.name) : undefined;
}

function httpStatus(err: unknown): number | undefined {
  const meta = (err as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata;
  return meta?.httpStatusCode;
}

/** S3 says the multipart upload no longer exists (completed, aborted or never created). */
export function isNoSuchUpload(err: unknown): boolean {
  return errorName(err) === 'NoSuchUpload';
}

@Injectable()
export class StorageService implements OnModuleInit, OnApplicationShutdown {
  private readonly prefix: string;
  private readonly publicUrl: string;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(S3_CLIENTS) private readonly s3: S3Clients,
  ) {
    this.prefix = config.s3.bucketPrefix;
    this.publicUrl = config.s3.publicUrl;
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBuckets();
  }

  onApplicationShutdown(): void {
    this.s3.internal.destroy();
    this.s3.presign.destroy();
  }

  bucket(name: BucketName): string {
    return `${this.prefix}${name}`;
  }

  /** Creates missing buckets; the media bucket allows anonymous `s3:GetObject`. */
  async ensureBuckets(): Promise<void> {
    for (const name of BUCKETS) {
      const Bucket = this.bucket(name);
      try {
        await this.s3.internal.send(new HeadBucketCommand({ Bucket }));
      } catch (err) {
        if (errorName(err) !== 'NotFound' && httpStatus(err) !== 404) throw err;
        try {
          await this.s3.internal.send(new CreateBucketCommand({ Bucket }));
        } catch (createErr) {
          if (errorName(createErr) !== 'BucketAlreadyOwnedByYou') throw createErr;
        }
      }
    }
    const media = this.bucket('media');
    await this.s3.internal.send(
      new PutBucketPolicyCommand({
        Bucket: media,
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${media}/*`],
            },
          ],
        }),
      }),
    );
  }

  /** URL for a browser `PUT` of one part. */
  presignPut(bucket: string, key: string, uploadId: string, partNumber: number): Promise<string> {
    return getSignedUrl(
      this.s3.presign,
      new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: PRESIGN_TTL_SEC },
    );
  }

  /** URL for one browser `PUT` of a whole object; the request must send this `Content-Type`. */
  presignPutObject(bucket: string, key: string, contentType: string): Promise<string> {
    return getSignedUrl(
      this.s3.presign,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
      { expiresIn: PRESIGN_TTL_SEC, signableHeaders: new Set(['content-type']) },
    );
  }

  /** Size and type of an object, or `null` when it does not exist. */
  async headObject(
    bucket: string,
    key: string,
  ): Promise<{ size: number; contentType?: string } | null> {
    try {
      const res = await this.s3.internal.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { size: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch (err) {
      if (errorName(err) === 'NotFound' || httpStatus(err) === 404) return null;
      throw err;
    }
  }

  /** The first `length` bytes of an object (fewer when it is shorter). */
  async readStart(bucket: string, key: string, length: number): Promise<Buffer> {
    const res = await this.s3.internal.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${length - 1}` }),
    );
    const bytes = await res.Body?.transformToByteArray();
    return Buffer.from(bytes ?? []);
  }

  presignGet(
    bucket: string,
    key: string,
    ttlSec = PRESIGN_TTL_SEC,
    fileName?: string,
  ): Promise<string> {
    return getSignedUrl(
      this.s3.presign,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: fileName ? attachmentDisposition(fileName) : undefined,
      }),
      { expiresIn: ttlSec },
    );
  }

  async createMultipart(bucket: string, key: string, contentType?: string): Promise<string> {
    const res = await this.s3.internal.send(
      new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    );
    if (!res.UploadId) throw new Error('S3 returned no UploadId');
    return res.UploadId;
  }

  /** Every part S3 already holds, in part order (follows pagination). */
  async listParts(bucket: string, key: string, uploadId: string): Promise<StoredPart[]> {
    const parts: StoredPart[] = [];
    let marker: string | undefined;
    for (;;) {
      const res = await this.s3.internal.send(
        new ListPartsCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          PartNumberMarker: marker,
        }),
      );
      for (const p of res.Parts ?? []) {
        if (p.PartNumber === undefined || !p.ETag) continue;
        parts.push({ partNumber: p.PartNumber, etag: p.ETag, size: p.Size ?? 0 });
      }
      if (!res.IsTruncated || !res.NextPartNumberMarker) break;
      marker = res.NextPartNumberMarker;
    }
    return parts.sort((a, b) => a.partNumber - b.partNumber);
  }

  async completeMultipart(
    bucket: string,
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
  ): Promise<void> {
    await this.s3.internal.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
  }

  /** Aborts a multipart upload; one that no longer exists counts as aborted. */
  async abortMultipart(bucket: string, key: string, uploadId: string): Promise<void> {
    try {
      await this.s3.internal.send(
        new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }),
      );
    } catch (err) {
      if (!isNoSuchUpload(err)) throw err;
    }
  }

  async putObject(
    bucket: string,
    key: string,
    body: PutObjectCommandInput['Body'],
    contentType?: string,
  ): Promise<void> {
    await this.s3.internal.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  /** Deleting a missing object succeeds (S3 semantics). */
  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.s3.internal.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  /** Public URL of an object in the anonymous-read media bucket. */
  mediaUrl(key: string): string {
    return `${this.publicUrl}/${this.bucket('media')}/${key}`;
  }
}
