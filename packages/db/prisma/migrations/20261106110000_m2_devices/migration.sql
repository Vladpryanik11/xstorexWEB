-- M2 devices, enrollment and checkout-account identity fields
CREATE TYPE "DeviceStatus" AS ENUM ('new', 'pending', 'processing', 'active', 'blocked', 'expired');
CREATE TYPE "EnrollmentStatus" AS ENUM ('pending', 'completed', 'failed', 'expired');

ALTER TABLE "User"
  ADD COLUMN "isProvisional" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "checkoutEmail" TEXT;

CREATE INDEX "User_isProvisional_checkoutEmail_idx"
  ON "User"("isProvisional", "checkoutEmail");

ALTER TABLE "User"
  ADD CONSTRAINT "User_provisional_identity_check"
  CHECK (NOT "isProvisional" OR ("email" IS NULL AND "checkoutEmail" IS NOT NULL));

CREATE TABLE "Device" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "udid" TEXT NOT NULL,
  "product" TEXT NOT NULL,
  "iosVersion" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "DeviceStatus" NOT NULL DEFAULT 'new',
  "appleAccountId" TEXT,
  "registeredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Device_udid_key" ON "Device"("udid");
CREATE INDEX "Device_userId_createdAt_idx" ON "Device"("userId", "createdAt");
CREATE INDEX "Device_status_idx" ON "Device"("status");

CREATE TABLE "EnrollmentSession" (
  "nonce" TEXT NOT NULL,
  "status" "EnrollmentStatus" NOT NULL DEFAULT 'pending',
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "deviceId" TEXT,
  "next" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnrollmentSession_pkey" PRIMARY KEY ("nonce")
);

CREATE INDEX "EnrollmentSession_userId_createdAt_idx"
  ON "EnrollmentSession"("userId", "createdAt");
CREATE INDEX "EnrollmentSession_status_expiresAt_idx"
  ON "EnrollmentSession"("status", "expiresAt");
CREATE INDEX "EnrollmentSession_deviceId_idx" ON "EnrollmentSession"("deviceId");

ALTER TABLE "Session" ADD COLUMN "deviceId" TEXT;
CREATE INDEX "Session_deviceId_idx" ON "Session"("deviceId");
ALTER TABLE "Session"
  ADD CONSTRAINT "Session_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Session_staff_device_check"
  CHECK ("kind" <> 'staff' OR "deviceId" IS NULL);

ALTER TABLE "Device"
  ADD CONSTRAINT "Device_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnrollmentSession"
  ADD CONSTRAINT "EnrollmentSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "EnrollmentSession_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "EnrollmentSession_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- M1 created install events before Device existed. Keep their catalog-count rows,
-- but remove device links that cannot be mapped to an M2 Device.
ALTER TABLE "InstallEvent" ALTER COLUMN "deviceId" DROP NOT NULL;

UPDATE "InstallEvent" e
SET "deviceId" = NULL
WHERE NOT EXISTS (
  SELECT 1 FROM "Device" d WHERE d."id" = e."deviceId"
);
ALTER TABLE "InstallEvent"
  ADD CONSTRAINT "InstallEvent_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
