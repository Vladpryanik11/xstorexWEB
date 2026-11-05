import { Global, Module } from '@nestjs/common';
import { s3Provider } from './s3.provider.js';
import { StorageService } from './storage.service.js';

/** S3 (MinIO) access for every feature module; buckets are ensured on boot. */
@Global()
@Module({ providers: [s3Provider, StorageService], exports: [StorageService] })
export class StorageModule {}
