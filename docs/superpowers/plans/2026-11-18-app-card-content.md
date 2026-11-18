# План: блоки карточки приложения и демо-каталог

Спецификация: `docs/superpowers/specs/2026-11-18-app-card-content-design.md`.

1. **Схема.** Миграция `AppVersion.deviceFamily Int[] DEFAULT ARRAY[1]`. Воркер (`attach.ts`) сохраняет `inspect.deviceFamily`. Тест: `apps/worker/test/attach.int.test.ts`.
2. **API.** `AppDetail.devices` и `AppDetail.similar` в `@xstore/shared`; `CatalogService.app` считает их. Тесты: `apps/api/test/catalog.int.test.ts` (устройства по последней версии, похожие без себя, скрытых и чужих категорий, порядок, лимит 12).
3. **Описание группами.** `parseDescription` в `packages/ui/src/more-text/` + рендер в `MoreText` (абзацы, подзаголовки, списки; свёртка по высоте 3 строк). Модульные тесты.
4. **Страница приложения.** Строки «Устройства» и «Обновлено», подпись под скриншотами, фраза для удалённых, рельс «Похожие приложения» (`IconTile`/`AppRow` из `@xstore/ui`). Модульные тесты хелперов в `src/app-page/`, E2E — проверка блоков на странице приложения.
5. **Демо-каталог.** `packages/db/demo/catalog.ts` (данные), `packages/db/demo/media/`, `packages/db/prisma/seed-demo.ts`, скрипты `seed:demo` и `db:seed:demo`, раздел в README.
6. **CLAUDE.md.** Уточнить правило про файлы DIYORDE: иконки и скриншоты приложений из App Store можно, логотип, оформление и тексты — нет.
7. **Проверки.** lint, typecheck, test, test:int, e2e (Chromium локально), скриншоты страницы приложения и главной на демо-каталоге.
