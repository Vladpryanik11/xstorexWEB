import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { WorkerS3Config } from './config.js';

export type BucketName = 'originals' | 'media' | 'signed' | 'uploads';

export type WorkerS3 = {
  client: S3Client;
  bucket(name: BucketName): string;
  /** Streams an object to a local file. */
  download(bucket: string, key: string, path: string): Promise<void>;
  put(bucket: string, key: string, body: Buffer, contentType: string): Promise<void>;
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
    destroy: () => client.destroy(),
  };
}
