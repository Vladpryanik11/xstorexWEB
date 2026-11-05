-- M1 catalog: additive only. Existing Setting data is preserved.
CREATE TYPE "PublicationStatus" AS ENUM ('draft', 'published', 'hidden');
CREATE TYPE "CollectionLayout" AS ENUM ('grid3', 'icons', 'screenshots', 'banner');
CREATE TYPE "CollectionSource" AS ENUM ('manual', 'top_downloads', 'trending', 'top_rated', 'recently_updated');

CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "App" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "developer" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "iconKey" TEXT,
    "screenshotKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "removedFromAppStore" BOOLEAN NOT NULL DEFAULT false,
    "rightsBasis" TEXT NOT NULL DEFAULT '',
    "accessLevel" TEXT NOT NULL DEFAULT 'free',
    "status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "App_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "App_published_rights_basis_check"
      CHECK ("status" <> 'published' OR "rightsBasis" ~ '[^[:space:]]')
);

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
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "changelog" TEXT,
    "status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    CONSTRAINT "AppVersion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AppVersion_published_unencrypted_check"
      CHECK ("status" <> 'published' OR "encrypted" = false)
);

CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "layout" "CollectionLayout" NOT NULL,
    "source" "CollectionSource" NOT NULL DEFAULT 'manual',
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollectionItem" (
    "collectionId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,
    CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("collectionId", "appId")
);

CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");
CREATE UNIQUE INDEX "App_slug_key" ON "App"("slug");
CREATE INDEX "App_categoryId_status_idx" ON "App"("categoryId", "status");
CREATE INDEX "App_status_createdAt_idx" ON "App"("status", "createdAt");
CREATE UNIQUE INDEX "AppVersion_appId_bundleId_version_build_key" ON "AppVersion"("appId", "bundleId", "version", "build");
CREATE INDEX "AppVersion_bundleId_idx" ON "AppVersion"("bundleId");
CREATE INDEX "AppVersion_appId_status_publishedAt_idx" ON "AppVersion"("appId", "status", "publishedAt");
CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");
CREATE UNIQUE INDEX "CollectionItem_collectionId_sort_key" ON "CollectionItem"("collectionId", "sort");
CREATE INDEX "CollectionItem_appId_idx" ON "CollectionItem"("appId");

ALTER TABLE "App" ADD CONSTRAINT "App_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppVersion" ADD CONSTRAINT "AppVersion_appId_fkey"
  FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_collectionId_fkey"
  FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_appId_fkey"
  FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
