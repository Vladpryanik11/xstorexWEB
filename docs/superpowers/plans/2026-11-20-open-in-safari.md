# План: экран «Осталось открыть в Safari» (спека v2 §4, шаг 2а)

Одобрено владельцем 20.11 («да» на объединённый вариант А + Б + В и строку Г). Каждая задача — сначала падающий тест.

## Задача 1. Токен переноса входа (API)

- `packages/db`: модель `LoginHandoff` (`id`, `tokenHash` уникальный, `userId`, `expiresAt`, `usedAt?`, `createdAt`), миграция `20261120160000_login_handoff`.
- `packages/shared`: `ErrorCode.HANDOFF_INVALID` и текст «Ссылка для входа устарела. Войдите по коду из письма»; схемы `handoffResponseSchema` (`{ token, expiresAt }`) и `handoffRedeemSchema` (`{ token }`, 43 символа base64url).
- `apps/api/src/auth/handoff.service.ts`: `issue(userId)` (срок 10 минут, хранится только SHA-256), `redeem(token, current, meta)`:
  - текущая сессия того же покупателя → ничего не тратим;
  - иначе атомарно `updateMany where usedAt = null and expiresAt > now` → новая сессия;
  - не найден, истёк, использован, покупатель заблокирован или не `user` → `HANDOFF_INVALID` (400).
- `CustomerAuthController`: `POST /auth/handoff` (`@RequireUser`, 10 за 10 минут на покупателя) и `POST /auth/handoff/redeem` (30 за 10 минут на IP; прежняя сессия браузера закрывается, как при входе кодом).
- Тесты: интеграционные `apps/api/test/handoff.int.test.ts` — выдача, вход в другом браузере, повтор отклонён, истёкший отклонён, тот же покупатель не тратит токен, гость (provisional) переносится, сотрудник не может выдать.

## Задача 2. Распознавание браузера (web)

- `apps/web/src/checkout/in-app-browser.ts`: `browserApp(userAgent, hasTelegramProxy)` → `'safari' | 'telegram' | 'instagram' | 'facebook' | 'vk' | 'chrome' | 'yandex' | 'firefox' | 'edge' | 'opera' | 'google' | 'webview'`; `safariHint(app)`.
- Модульные тесты на строки userAgent каждого приложения и на Safari iPhone/iPad.

## Задача 3. Экран-переход и строка «Работает только в Safari» (web)

- `connectStep`: новое состояние `open_in_safari` для iOS не в Safari вместо `guide`/`waiting`.
- `OpenInSafari.tsx`: запрашивает токен, кладёт `?h=` в адрес, кнопка `x-safari-https://…`, подсказка, «Скопировать ссылку».
- Под кнопкой «Подключить iPhone» — «Работает только в Safari».
- `/get/iphone?h=…`: клиентский `HandoffRedeem` отправляет redeem и открывает `/get/iphone` или `/signin?next=/get/iphone&handoff=expired`; `/signin` показывает подсказку. `referrer: no-referrer`.
- Тесты: `connect-step.test.ts`, `ConnectStep.test.tsx`, `OpenInSafari.test.tsx`, `HandoffRedeem.test.tsx`, e2e `open-in-safari.spec.ts` (Chrome на iPhone → токен → «Safari» входит без пароля).

## Задача 4. Проверка и PR

`pnpm lint`, typecheck пакетов, модульные тесты; интеграционные и e2e — в CI. После слияния — проверить на iPhone владельца, в каких приложениях срабатывает `x-safari-https`.
