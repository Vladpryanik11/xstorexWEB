-- Simple IPA upload (owner 2026-11-24): catalog sections «Удалённые» / «Премиум» on the app.
CREATE TYPE "AppSection" AS ENUM ('removed', 'premium');

ALTER TABLE "App" ADD COLUMN "section" "AppSection";

CREATE INDEX "App_status_section_idx" ON "App"("status", "section");

UPDATE "App" SET "section" = 'removed' WHERE "removedFromAppStore";

UPDATE "App" a SET "section" = 'premium'
WHERE a."section" IS NULL
  AND EXISTS (
    SELECT 1 FROM "CollectionItem" ci
    JOIN "Collection" c ON c."id" = ci."collectionId"
    WHERE c."slug" = 'premium' AND ci."appId" = a."id"
  );

-- Subcategories shared by both sections; existing slugs are left as they are.
INSERT INTO "Category" ("id", "slug", "name", "icon", "sort") VALUES
  ('cat_music', 'music', 'Музыка', 'music', 10),
  ('cat_video', 'video', 'Кино и видео', 'video', 20),
  ('cat_photo', 'photo', 'Фото и видео', 'photo', 30),
  ('cat_games', 'games', 'Игры', 'games', 40),
  ('cat_social', 'social', 'Соцсети', 'social', 50),
  ('cat_finance', 'finance', 'Банки и финансы', 'finance', 60),
  ('cat_education', 'education', 'Учёба и книги', 'education', 70),
  ('cat_tools', 'tools', 'Полезное', 'tools', 80)
ON CONFLICT ("slug") DO NOTHING;
