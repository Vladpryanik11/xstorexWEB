-- CreateEnum
CREATE TYPE "DeviceCertificateStatus" AS ENUM ('active', 'replaced', 'revoked', 'expired', 'deleted');

-- CreateTable
CREATE TABLE "DeviceCertificate" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "status" "DeviceCertificateStatus" NOT NULL DEFAULT 'active',
    "p12Enc" TEXT NOT NULL,
    "p12PasswordEnc" TEXT NOT NULL,
    "profile" BYTEA NOT NULL,
    "profileUuid" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "appIdPattern" TEXT NOT NULL,
    "certSerial" TEXT NOT NULL,
    "certSha1" TEXT NOT NULL,
    "certNotAfter" TIMESTAMP(3) NOT NULL,
    "profileExpiresAt" TIMESTAMP(3) NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceCertificate_certSha1_status_idx" ON "DeviceCertificate"("certSha1", "status");

-- CreateIndex
CREATE INDEX "DeviceCertificate_deviceId_createdAt_idx" ON "DeviceCertificate"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "DeviceCertificate_status_idx" ON "DeviceCertificate"("status");

-- AddForeignKey
ALTER TABLE "DeviceCertificate" ADD CONSTRAINT "DeviceCertificate_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCertificate" ADD CONSTRAINT "DeviceCertificate_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- At most one active certificate per device.
CREATE UNIQUE INDEX "device_certificate_one_active" ON "DeviceCertificate"("deviceId") WHERE "status" = 'active';
