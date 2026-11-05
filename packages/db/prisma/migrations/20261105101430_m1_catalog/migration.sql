-- Trigram search over app names (catalog search, M1 Task 6).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "AppStatus" AS ENUM ('draft', 'published', 'hidden');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('draft', 'published', 'rejected');

-- CreateEnum
CREATE TYPE "CollectionLayout" AS ENUM ('grid3', 'icons', 'screenshots', 'banner');

-- CreateEnum
CREATE TYPE "CollectionSource" AS ENUM ('manual', 'top_downloads', 'trending', 'top_rated', 'recently_updated');

-- CreateTable
CREATE TABLE "App" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "developer" TEXT,
    "categoryId" TEXT,
    "iconKey" TEXT,
    "screenshotKeys" TEXT[],
    "bannerKey" TEXT,
    "removedFromAppStore" BOOLEAN NOT NULL DEFAULT false,
    "rightsBasis" TEXT,
    "accessLevel" TEXT NOT NULL DEFAULT 'free',
    "status" "AppStatus" NOT NULL DEFAULT 'draft',
    "hiddenReason" TEXT,
    "rating" DOUBLE PRECISION,
    "ratingCount" INTEGER,
    "languages" TEXT[],
    "itunesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "App_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppVersion" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "build" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "minIos" TEXT,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "ipaKey" TEXT NOT NULL,
    "icon57Key" TEXT,
    "encrypted" BOOLEAN NOT NULL,
    "changelog" TEXT,
    "status" "VersionStatus" NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "layout" "CollectionLayout" NOT NULL,
    "source" "CollectionSource" NOT NULL,
    "sort" INTEGER NOT NULL,
    "limit" INTEGER NOT NULL DEFAULT 12,
    "onHome" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionItem" (
    "collectionId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("collectionId","appId")
);

-- CreateTable
CREATE TABLE "InstallEvent" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "App_slug_key" ON "App"("slug");

-- CreateIndex
CREATE INDEX "App_status_idx" ON "App"("status");

-- CreateIndex
CREATE INDEX "App_categoryId_idx" ON "App"("categoryId");

-- CreateIndex
CREATE INDEX "AppVersion_bundleId_idx" ON "AppVersion"("bundleId");

-- CreateIndex
CREATE INDEX "AppVersion_appId_publishedAt_idx" ON "AppVersion"("appId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppVersion_bundleId_version_build_key" ON "AppVersion"("bundleId", "version", "build");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_sort_idx" ON "Category"("sort");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");

-- CreateIndex
CREATE INDEX "Collection_sort_idx" ON "Collection"("sort");

-- CreateIndex
CREATE INDEX "CollectionItem_appId_idx" ON "CollectionItem"("appId");

-- CreateIndex
CREATE INDEX "InstallEvent_appId_createdAt_idx" ON "InstallEvent"("appId", "createdAt");

-- AddForeignKey
ALTER TABLE "App" ADD CONSTRAINT "App_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppVersion" ADD CONSTRAINT "AppVersion_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallEvent" ADD CONSTRAINT "InstallEvent_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "App_name_trgm_idx" ON "App" USING GIN (lower("name") gin_trgm_ops);
