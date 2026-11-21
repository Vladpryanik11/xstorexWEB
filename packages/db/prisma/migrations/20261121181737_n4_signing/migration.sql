-- CreateEnum
CREATE TYPE "SigningStage" AS ENUM ('queued', 'downloading', 'signing', 'uploading', 'ready', 'failed');

-- CreateTable
CREATE TABLE "SigningJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "appVersionId" TEXT NOT NULL,
    "deviceCertificateId" TEXT NOT NULL,
    "queueJobId" TEXT NOT NULL,
    "stage" "SigningStage" NOT NULL DEFAULT 'queued',
    "errorCode" TEXT,
    "signedBuildId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SigningJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignedBuild" (
    "id" TEXT NOT NULL,
    "appVersionId" TEXT NOT NULL,
    "deviceCertificateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignedBuild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallToken" (
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "signedBuildId" TEXT NOT NULL,
    "appVersionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedIp" TEXT,
    "usedUa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallToken_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE INDEX "SigningJob_queueJobId_stage_idx" ON "SigningJob"("queueJobId", "stage");

-- CreateIndex
CREATE INDEX "SigningJob_createdAt_idx" ON "SigningJob"("createdAt");

-- CreateIndex
CREATE INDEX "SigningJob_userId_createdAt_idx" ON "SigningJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SignedBuild_lastUsedAt_idx" ON "SignedBuild"("lastUsedAt");

-- CreateIndex
CREATE INDEX "SignedBuild_deviceCertificateId_idx" ON "SignedBuild"("deviceCertificateId");

-- CreateIndex
CREATE UNIQUE INDEX "SignedBuild_appVersionId_deviceCertificateId_key" ON "SignedBuild"("appVersionId", "deviceCertificateId");

-- CreateIndex
CREATE INDEX "InstallToken_signedBuildId_expiresAt_idx" ON "InstallToken"("signedBuildId", "expiresAt");

-- CreateIndex
CREATE INDEX "InstallToken_expiresAt_idx" ON "InstallToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "SigningJob" ADD CONSTRAINT "SigningJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningJob" ADD CONSTRAINT "SigningJob_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningJob" ADD CONSTRAINT "SigningJob_appVersionId_fkey" FOREIGN KEY ("appVersionId") REFERENCES "AppVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningJob" ADD CONSTRAINT "SigningJob_deviceCertificateId_fkey" FOREIGN KEY ("deviceCertificateId") REFERENCES "DeviceCertificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningJob" ADD CONSTRAINT "SigningJob_signedBuildId_fkey" FOREIGN KEY ("signedBuildId") REFERENCES "SignedBuild"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignedBuild" ADD CONSTRAINT "SignedBuild_appVersionId_fkey" FOREIGN KEY ("appVersionId") REFERENCES "AppVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignedBuild" ADD CONSTRAINT "SignedBuild_deviceCertificateId_fkey" FOREIGN KEY ("deviceCertificateId") REFERENCES "DeviceCertificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallToken" ADD CONSTRAINT "InstallToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallToken" ADD CONSTRAINT "InstallToken_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallToken" ADD CONSTRAINT "InstallToken_signedBuildId_fkey" FOREIGN KEY ("signedBuildId") REFERENCES "SignedBuild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallToken" ADD CONSTRAINT "InstallToken_appVersionId_fkey" FOREIGN KEY ("appVersionId") REFERENCES "AppVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
