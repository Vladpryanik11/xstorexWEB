# План: премиальный интерфейс Xstore

Спецификация: `docs/superpowers/specs/2026-11-17-premium-ui-design.md`. Ветка: `claude/project-thread-mp4tk3`. Исполнитель: Claude Code. Ревью: Codex.

Каждая задача идёт по TDD: сначала падающий тест (модульный в Vitest или E2E в Playwright), потом код, потом `pnpm lint && pnpm typecheck` и тесты затронутых пакетов. Коммит после каждой задачи.

## Задача 1. Токены и скилл

Файлы: `packages/ui/src/tokens.css`, `packages/ui/src/tokens.test.ts` (новый), `.claude/skills/xstore-design/SKILL.md`.

1. Тест читает `tokens.css` и проверяет значения новых токенов из раздела 3 спецификации, а также радиусы и тени из раздела 4.
2. Добавить новые токены. Старые (`--x-page`, `--x-surface`, `--x-ink`, `--x-text-2`) на время переноса становятся псевдонимами новых, чтобы страницы не сломались. `--x-header-gradient`, `--x-glass` удаляются в задаче 4.
3. Переписать токены, шапку, компоненты и правила проверки в скилле `xstore-design` под новую спецификацию. Сравнение с diyorde в разделе «Verification» заменить сравнением с макетом палитры и скриншотами «до».

## Задача 2. Зависимости

Файлы: `packages/ui/package.json`, `apps/web/package.json`, `pnpm-lock.yaml`.

1. Добавить `motion` и `sonner` с точными версиями.
2. Проверка: `pnpm install`, `pnpm build` проходит, размер первого JS главной вырос не больше чем на 40 КБ gzip (сравнить вывод `next build` до и после).

## Задача 3. Базовые компоненты в новых формах

Файлы: `packages/ui/src/{button,chip,search,section,cover,spot-banner,rows-grid,app-row,facts,info-list,install-banner}/*`.

1. Обновить тесты: кнопки, чипы, поиск — пилюли; тихая кнопка `--x-sky-50` / `--x-quiet-fg`; активный чип синий; тени голубые.
2. Перевести стили на новые токены и радиусы.
3. Плавающая плашка установки: стекло (Glass Surface, задача 4.3), синяя пилюля «Установить».

## Задача 4. Шапка

Файлы: `apps/web/src/shell/{Header,NavLinks,MobileMenu}.tsx`, `Header.module.css`, `Header.test.tsx`, `apps/web/e2e/header.spec.ts`, новый `apps/web/src/shell/CardNav.tsx`.

1. Сначала переписать `header.spec.ts` и `Header.test.tsx` под раздел 5 спецификации: плавающая пилюля с отступом сверху, белый фон с размытием, активный пункт `--x-sky-50`, сужение после прокрутки на 24px (ширина ≤ 56rem, высота 48px), нет полосы 6px и градиента, нет горизонтальной прокрутки на 390/768/1280px.
2. Плавающая пилюля по [Floating Glassmorphic Navbar](https://21st.dev/@themeocean/components/floating-glassmorphic-navbar-with-morphing-pill-indicator): подложка активного пункта через `motion` `layoutId`, перетекает при наведении.
3. Стекло по [Glass Surface](https://reactbits.dev/components/glass-surface), сужение при прокрутке по [Resizable Navbar](https://ui.aceternity.com/components/resizable-navbar).
4. Меню на iPhone по [Card Nav](https://reactbits.dev/components/card-nav) вместо боковой шторки: карточки «Каталог», «Аккаунт», «Помощь»; Esc, тап вне, ловушка фокуса, блок прокрутки, `aria-expanded`. Тесты переносятся из старого `MobileMenu`.
5. Удалить `--x-header-gradient`, `--x-glass`, полосу 6px и эталон из тестов.

## Задача 5. Герой главной и плашка

Файлы: `apps/web/app/(home)/page.tsx`, `page.module.css`, `apps/web/e2e/catalog.spec.ts`.

1. E2E: у героя светлый фон, слово XSTORE с `aria-hidden`, на 390px плашка установки не перекрывает последний и первый видимые ряды (сравнить прямоугольники), нет горизонтальной прокрутки.
2. Светлый герой по разделу 6 спецификации, нижний отступ страницы под плашку.

## Задача 6. Рельсы и чипы

Файлы: `packages/ui/src/rail/*`, `apps/web/src/catalog/CategoryChips.*`, новый `packages/ui/src/progressive-blur/`.

1. Тесты: у рельса есть края с размытием, которые скрыты, если прокручивать некуда; у чипов одна подложка активного элемента.
2. [Progressive Blur](https://magicui.design/docs/components/progressive-blur) на краях рельсов (CSS-маски и `backdrop-filter`, без JS).
3. [Animated Background](https://motion-primitives.com/docs/animated-background) под активным чипом.

## Задача 7. Превью приложения (Morphing Dialog)

Файлы: новый `apps/web/src/catalog/AppPreview.tsx`, `AppCardRow.tsx`, тесты.

1. Тесты: тап по иконке открывает диалог с ролью `dialog`, названием, подзаголовком, «Установить» и ссылкой «Подробнее» на `/app/[slug]`; Esc закрывает и возвращает фокус; при reduced motion перехода нет. Название строки по-прежнему ведёт на страницу приложения, чтобы не ломать SEO и прямые ссылки.
2. Реализация по [Morphing Dialog](https://motion-primitives.com/docs/morphing-dialog) через `motion` `layoutId` для иконки и карточки.

## Задача 8. Карточка приложения

Файлы: `apps/web/app/(site)/app/[slug]/page.*`, новый `packages/ui/src/iphone-frame/`.

1. Тест: скриншоты выводятся внутри рамки iPhone, у каждого есть `alt`, рельс не шире экрана.
2. Рамка по [iPhone](https://magicui.design/docs/components/iphone) (SVG без внешних картинок).

## Задача 9. Компоненты для покупки, подключения и установки

Файлы: новые `packages/ui/src/{staged-progress,stepper,border-beam,toast}/`, `apps/web/app/dev/ui/page.tsx`.

Страниц `/pricing`, `/connect-device` и экрана установки в main пока нет, поэтому компоненты делаем с тестами и показываем на `/dev/ui`, а встраиваем в соответствующих вехах M2–M5.

1. [Staged Progress Bar](https://21st.dev/@dhxwhy/components/staged-progress-bar): этапы «Регистрация устройства», «Подпись», «Загрузка», «Установка», `role="progressbar"`, `aria-valuenow`, подпись текущего этапа.
2. [Stepper вертикальный](https://21st.dev/@originui/components/stepper/vertical-with-inline-titles-and-descriptions): шаги подключения iPhone, `aria-current="step"`.
3. [Border Beam](https://magicui.design/docs/components/border-beam): CSS-луч `--x-blue → --x-sky-200`, стоит при reduced motion.
4. [Sonner](https://21st.dev/@shadcn/components/sonner): общий `Toaster` в оформлении Xstore (пилюля `--x-text`, белый текст), подключить в корневой layout.

## Задача 10. Админка

Файлы: `apps/web/src/admin/*`, `apps/web/e2e/admin-catalog.spec.ts`.

1. E2E на 390px: в редакторе приложения нет горизонтальной прокрутки, кнопка «Сохранить» видна целиком; флаги — переключатели с ролью `switch`; после сохранения появляется уведомление «Сохранено».
2. Перевести админку на новые токены и формы.
3. Версии на ширине меньше 48em — карточки вместо таблицы.
4. [iOS-переключатель](https://uiverse.io/zanina-yassine/afraid-eel-50) (MIT) на `input type="checkbox" role="switch"`, цвет включения `--x-blue`.
5. Уведомления Sonner после сохранения и ошибок.

## Задача 11. Проверка и сдача

1. Удалить оставшиеся псевдонимы старых токенов, `rg` по `--x-ink|--x-page|--x-surface` пусто.
2. Полный набор: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm test:e2e`. Где контейнер не тянет `test:int`/`test:e2e` без Docker, прогнать в CI на PR.
3. Скриншоты 390 и 1280px всех публичных страниц и админки в `/mnt/project-files/screenshots/2026-11-17-after/`, сравнить с папкой `2026-11-17`.
4. Ревью кода, PR, слияние только по команде владельца.
