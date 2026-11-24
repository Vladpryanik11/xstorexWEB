# План: простая загрузка IPA и каталог «Удалённые / Премиум»

Спецификация: `docs/superpowers/specs/2026-11-24-simple-ipa-upload-design.md`. Исполнитель — Claude, ревью — по команде владельца. TDD: сначала падающий тест.

## Задача 1. База
- `enum AppSection { removed premium }`, `App.section AppSection?`, индекс `(status, section)`.
- Миграция `simple_upload`: поле, перенос из `removedFromAppStore` и подборки `premium`, вставка 8 подкатегорий `ON CONFLICT (slug) DO NOTHING`.
- `packages/db/src/publication.ts`: `syncAppPublication(tx, appId)` — считает блокеры, публикует последнюю незащищённую версию и приложение или возвращает в черновик; не трогает `hidden`. Тест в `packages/db/test`.

## Задача 2. Общие типы (`packages/shared`)
- `PublishBlocker`: `NO_SECTION`, `NO_CATEGORY`, `NO_ICON`, `NO_VERSION`.
- `appSectionSchema`; `updateAppSchema` + `section`; `adminAppsQuerySchema` + `section` (`removed|premium|none`).
- `AdminAppListItem` + `section`, `categoryId`, `sizeBytes`, `publishBlockers`.
- `hideAppSchema.reason` необязателен.
- `UploadListItem` для `GET /admin/uploads`.

## Задача 3. API админки
- `publish-rules.ts` по новым блокерам (модульный тест).
- `AdminAppsService`: после `update` и `commitMedia(icon)` — `syncAppPublication`; `section` синхронизирует `removedFromAppStore`; `hide` без причины; `unhide` через sync; `delete` с удалением файлов; `list` с новыми полями и фильтром.
- `UploadsService.list/remove`, маршруты `GET /admin/uploads`, `DELETE /admin/uploads/:id`.
- Интеграционные тесты в `apps/api/test/admin-catalog.int.test.ts` и `uploads`.

## Задача 4. Воркер
- `attach.ts`: после создания версии — `syncAppPublication` в той же транзакции; опубликованное приложение получает новую версию сразу. Тест в `apps/worker`.

## Задача 5. Каталог API
- `section('removed'|'premium')` по `App.section`, `?category=` фильтр; `GET /catalog/sections/:slug/categories`.
- `popular`, `all` остаются в API (не ломаем старые ссылки), с сайта не используются.

## Задача 6. Админка web
- `/admin/apps`: `AppsBoard` (клиент) — зона загрузки на всю страницу, загрузки с сервера + локальный прогресс, пилюли-фильтры, строки `AppRow` (переименование, иконка, раздел, подкатегория, статус, скрыть/показать, удалить с подтверждением).
- Убрать `/admin/apps/[id]`, `AppEditor`; `/admin/apps/upload` → redirect.
- Компонентные тесты `AppRow`.

## Задача 7. Сайт
- `SECTIONS` — только `removed`, `premium`; `/popular`, `/catalog` → redirect `/removed`.
- `SectionPage`: чипы подкатегорий раздела с `?c=`.
- Обновить затронутые модульные и e2e тесты.

## Задача 8. Документы
- CLAUDE.md (правило о правах), спецификация v2 (§2, §3.1 п. 3, §3.4, §10, история).

## Проверка
`pnpm -r typecheck`, `pnpm -r test`, интеграционные API и воркера, `pnpm lint`, e2e админки и каталога локально (Chromium), остальное — CI.
