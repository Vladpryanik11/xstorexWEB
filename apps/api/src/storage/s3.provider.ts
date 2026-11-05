import { S3Client } from '@aws-sdk/client-s3';
import type { Provider } from '@nestjs/common';
import type { AppConfig, S3Config } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';

export const S3_CLIENTS = Symbol('S3_CLIENTS');

export type S3Clients = {
  /** Talks to S3 from the server (`S3_ENDPOINT`). */
  internal: S3Client;
  /** Only signs URLs for browsers and devices; its endpoint is `S3_PUBLIC_URL` (the signature covers the host). */
  presign: S3Client;
};

function client(s3: S3Config, endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: s3.region,
    forcePathStyle: true,
    credentials: { accessKeyId: s3.accessKey, secretAccessKey: s3.secretKey },
    // Default SDK checksums would add x-amz-checksum-* to presigned part URLs, which a browser
    // PUT cannot satisfy; MinIO does not need them.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

export const s3Provider: Provider = {
  provide: S3_CLIENTS,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): S3Clients => ({
    internal: client(config.s3, config.s3.endpoint),
    presign: client(config.s3, config.s3.publicUrl),
  }),
};
