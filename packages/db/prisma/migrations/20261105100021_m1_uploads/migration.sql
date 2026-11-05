-- CreateEnum
CREATE TYPE "UploadPurpose" AS ENUM ('catalog', 'signer');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('uploading', 'uploaded', 'inspecting', 'ready', 'rejected', 'expired');

-- CreateTable
CREATE TABLE "IpaUpload" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "purpose" "UploadPurpose" NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "s3UploadId" TEXT,
    "fileName" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "partSize" INTEGER NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'uploading',
    "rejectCode" TEXT,
    "inspect" JSONB,
    "appVersionId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IpaUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IpaUpload_ownerId_idx" ON "IpaUpload"("ownerId");

-- CreateIndex
CREATE INDEX "IpaUpload_status_idx" ON "IpaUpload"("status");

-- AddForeignKey
ALTER TABLE "IpaUpload" ADD CONSTRAINT "IpaUpload_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
