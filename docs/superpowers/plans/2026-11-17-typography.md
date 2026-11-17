# План: типографика Manrope + Inter

Спецификация: `docs/superpowers/specs/2026-11-17-typography-design.md`. Ветка `claude/project-thread-mp4tk3`.

## Задача 1. Токены и подключение шрифтов
1. Тесты (красные): `packages/ui/src/tokens.test.ts` проверяет `--x-font`, `--x-font-head`, семь `--x-type-*`,
   три `--x-track-*` и отсутствие `--x-system`; `apps/web/app/layout.test.ts` проверяет, что на `<html>`
   висят переменные Manrope и Inter.
2. `tokens.css`: новые токены, `--x-system` удалить. `layout.tsx`: `Manrope` и `Inter` из `next/font/google`,
   переменные `--font-manrope`, `--font-inter`. `globals.css`: убрать переопределение `--x-font`,
   `body` набирается `--x-type-body` с `--x-track-body`.

## Задача 2. Перевод стилей на шкалу
1. Тест (красный): `apps/web/src/typography.test.ts` обходит `*.module.css` в `apps/web` и `packages/ui`:
   каждое `font:` — `var(--x-type-…)` или `inherit`, нет `font-size:` и `--x-system`
   (исключение: `.word` на главной).
2. Перевести все объявления по таблице спецификации §3; к каждому `font:` добавить `letter-spacing`
   из §4. Удалить отдельные переопределения размеров на ≥48em, которые теперь делает `clamp`.

## Задача 3. Проверка
1. E2E `apps/web/e2e/typography.spec.ts`: шрифт героя Manrope, текст Inter, межбуквенное расстояние.
2. `pnpm lint`, `pnpm -r typecheck`, модульные, e2e (локально chromium, WebKit в CI).
3. Скриншоты 390/1280 в `/mnt/project-files/screenshots/2026-11-17-fonts/`, PR.
