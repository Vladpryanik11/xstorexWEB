# Xstore (xstorex.ru)

Магазин IPA-приложений для iPhone с установкой из Safari: вход по UDID, регистрация устройств в пуле аккаунтов Apple Developer, серверная подпись (zsign), OTA-установка, тарифы и оплата через Platega, админка. Визуальный язык — diyorde.com.

Главный документ: `docs/superpowers/specs/2026-11-02-xstore-design.md`. Перед любой работой сверяйся с ним. Если задача ему противоречит, сначала обнови спецификацию вместе с владельцем.

## Общение

- С владельцем общаемся на русском.
- Интерфейс сайта только на русском, без i18n и переключателя языка.

## Процесс (обязателен)

1. Новая функция или изменение поведения → `superpowers:brainstorming` → спецификация в `docs/superpowers/specs/`.
2. Одобренная спецификация → `superpowers:writing-plans` → план в `docs/superpowers/plans/`. Одна веха (M0–M7) — один план.
3. Выполнение плана → `superpowers:subagent-driven-development` или `superpowers:executing-plans`.
4. Любой код → `superpowers:test-driven-development`: сначала падающий тест.
5. Баг → `superpowers:systematic-debugging` до любых правок.
6. Перед словами «готово» → `superpowers:verification-before-completion`: команды запущены, вывод показан.
7. Конец вехи → `superpowers:requesting-code-review`.

Код без одобренной спецификации и плана не пишем.

## Скиллы и плагины проекта

| Когда | Что использовать |
|---|---|
| Любая вёрстка, страницы, компоненты, админка | проектный скилл `xstore-design` (токены и шапка), плагин `frontend-design` |
| Next.js, React | `frontend-mobile-development` (nextjs-app-router-patterns) |
| TypeScript, Node, тесты JS | `javascript-typescript`, `typescript-lsp` |
| NestJS API, архитектура бэкенда | `backend-development`, `api-scaffolding` (user scope) |
| Схема БД, Prisma, миграции | `database-design` (user scope) |
| Безопасность: секреты, вебхуки, авторизация | `backend-api-security`, `security-guidance` (хук предупреждает при правках) |
| CI/CD, Docker, деплой | `cicd-automation` |
| Ревью | `comprehensive-review`, `superpowers:requesting-code-review` |
| Обновление этого файла | `claude-md-management` |

## Жёсткие правила

- Только IPA с правами на распространение. У каждого приложения заполнено «основание для распространения». Взломанные приложения и «Premium»-моды не добавляем.
- Оплата только через Platega. Telegram Stars не используем.
- Файлы DIYORDE (логотип, картинки, скриншоты, тексты) в продукт не попадают. Копируем только стили и структуру.
- Шапка сайта совпадает с эталоном `docs/superpowers/specs/assets/header-logged-in.png` и описанием в скилле `xstore-design`.
- Секреты (ключи ASC `.p8`, `.p12`, пароли, ключи Platega, мастер-ключ) не попадают в код, git, логи и ответы API. В базе они хранятся только зашифрованными.
- Закрытые ключи Apple расшифровывают только модуль `apple` и воркер.

## Структура и команды

Монорепо pnpm + Turborepo: `apps/web` (Next.js), `apps/api` (NestJS), `apps/worker` (BullMQ + zsign), `packages/shared`, `packages/db`, `packages/ui`, `infra/`. Команды сборки, тестов и запуска добавляются сюда в рамках вехи M0.
