# План: подпись без замены Bundle ID (2026-11-24)

Спецификация: `docs/superpowers/specs/2026-11-21-n4-signing-install-design.md` §3 (правка 24.11), `2026-11-19-certificate-supplier-design.md` §7.

Проблема: при профиле поставщика на одно приложение воркер подписывал каждое приложение с `Bundle ID` профиля, и на iPhone второе приложение заменяло первое. Владелец 24.11: в Feather с тем же комплектом приложения стоят рядом; идентификатор не меняем, предупреждение «заменит» убираем.

## Задача 1. Воркер подписывает с родным Bundle ID

- Тест (`apps/worker/test/signing.int.test.ts`): профиль `TEAM123456.ru.supplier.one` → zsign без `-b`, `SignedBuild.bundleId` = `Bundle ID` версии.
- Тест: готовая копия с чужим `bundleId` (сделана по-старому) не переиспользуется, приложение подписывается заново и запись обновляется.
- Код: `apps/worker/src/signing/sign.ts` — без `signingBundleId`, копия переиспользуется только при совпадающем `bundleId`.
- `packages/shared/src/install.ts`: убрать `signingBundleId` и его тесты.

## Задача 2. API не спрашивает «заменит» и не отдаёт старые копии

- Тест (`apps/api/test/install.int.test.ts`): профиль на одно приложение, после установки первого второе ставится без `REPLACES_APP`.
- Тест: готовая копия с чужим `bundleId` не отдаётся сразу, нажатие ставит подпись в очередь.
- Код: `apps/api/src/install/install.service.ts` — убрать проверку `REPLACES_APP`, сверять `bundleId` копии с версией.

## Проверка

`pnpm lint`, `pnpm typecheck`, `pnpm test`, затронутые интеграционные тесты API и воркера; полный набор — CI.
