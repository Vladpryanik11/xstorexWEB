# План: первый экран главной и шапка

Спецификация: `docs/superpowers/specs/2026-11-23-home-first-screen-design.md`. Ветка `claude/project-thread-2tx3rh`. Каждая задача — сначала падающий тест.

1. **Шрифты.** `app/layout.tsx`: Unbounded + Onest через `next/font/google` (`--font-unbounded`, `--font-onest`). `packages/ui/src/tokens.css`: `--x-font`, `--x-font-head`, вес заголовков 500, трекинг. Тест: `e2e/typography.spec.ts` (Unbounded у h1, Onest у body, трекинг).
2. **Шапка.** `src/shell/nav.ts`: средний ряд «Как это работает» · «Вопросы» · «Блог»; `navFor` — гость «Войти» + «Подключить iPhone», вошедший «Мой доступ» + «Подключить iPhone», подписчик «Мой доступ». Мобильное меню сохраняет «Тарифы» и «Поддержку». `Header.tsx` / CSS: значок человечка на телефоне, кнопка 32 px, перелив. Тесты: `nav.test.ts`, `Header.test.tsx`, `e2e/header.spec.ts`.
3. **Герой.** `src/home/HomeHero.tsx` + CSS по §3–5: тексты, галочки, баннер с лентой иконок, поиск, кнопка, гарантия, «10 000+», три шага, фон-небо, тени, перелив. Якорь `id="how"` у «Как это работает». Тест: `HomeHero.test.tsx`.
4. **Строка состояния.** `viewport.themeColor` главной `#1E8FFF`. Тест: `e2e/header.spec.ts`.
5. **Проверка.** `pnpm lint`, `pnpm typecheck`, `pnpm test`, e2e героя/шапки/шрифтов локально в Chromium, скриншоты 390 и 1440 px. Полный набор — в CI.
