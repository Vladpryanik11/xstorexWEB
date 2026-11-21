import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { WorkerS3Config } from './config.js';

export type BucketName = 'originals' | 'media' | 'signed' | 'uploads';

export type WorkerS3 = {
  client: S3Client;
  bucket(name: BucketName): string;
  /** Streams an object to a local file. */
  download(bucket: string, key: string, path: string): Promise<void>;
  put(bucket: string, key: string, body: Buffer, contentType: string): Promise<void>;
  /** Streams a local file up in 16 MiB parts (multipart); the file is never read whole. */
  uploadFile(bucket: string, key: string, path: string, contentType: string): Promise<void>;
  /** Copies an object inside a bucket; `false` when the source does not exist. */
  copy(bucket: string, from: string, to: string): Promise<boolean>;
  /** Deletes an object; deleting a missing object is not an error. */
  remove(bucket: string, key: string): Promise<void>;
  destroy(): void;
};

export function createWorkerS3(config: WorkerS3Config): WorkerS3 {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return {
    client,
    bucket: (name) => `${config.bucketPrefix}${name}`,
    async download(bucket, key, path) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!(res.Body instanceof Readable)) throw new Error('S3 returned no body stream');
      await pipeline(res.Body, createWriteStream(path));
    },
    async put(bucket, key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
    async uploadFile(bucket, key, path, contentType) {
      await new Upload({
        client,
        params: {
          Bucket: bucket,
          Key: key,
          Body: createReadStream(path),
          ContentType: contentType,
        },
        partSize: 16 * 1024 * 1024,
        queueSize: 2,
      }).done();
    },
    async copy(bucket, from, to) {
      try {
        await client.send(
          new CopyObjectCommand({
            Bucket: bucket,
            Key: to,
            CopySource: `${bucket}/${from.split('/').map(encodeURIComponent).join('/')}`,
          }),
        );
        return true;
      } catch (err) {
        if ((err as { name?: string }).name === 'NoSuchKey') return false;
        throw err;
      }
    },
    async remove(bucket, key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    destroy: () => client.destroy(),
  };
}
