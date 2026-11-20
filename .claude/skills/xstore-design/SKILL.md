---
name: xstore-design
description: Use for any Xstore UI work — public pages, account area, admin, header, footer, components — to apply the white/sky/blue palette, rounded shapes and floating header with exact tokens. Load before writing or changing any markup or CSS in apps/web or packages/ui.
---

# Xstore design system

Palette «белый, голубой, синий», maximally rounded shapes, a floating white glass header. Page structure (rails, 3×N rows, icon rows, chips, 16:10 covers, app page, footer) comes from diyorde.com; DIYORDE assets (logo, images, screenshots, texts) never ship. UI language is Russian only, no language switcher.

Spec: `docs/superpowers/specs/2026-11-17-premium-ui-design.md` (authoritative), plan `docs/superpowers/plans/2026-11-17-premium-ui.md`. Palette mock: https://claude.ai/artifact/A3x4saaLnN6TSkz78NwSxx

## Tokens

Source of truth: `packages/ui/src/tokens.css` (pinned by `tokens.test.ts`).

| Token | Value | Use |
|---|---|---|
| `--x-white` | `#fff` | panels, cards, header pill, search |
| `--x-ice` | `#f2f8fd` | page background |
| `--x-sky-50` | `#e3edfd` | hero, quiet buttons, active nav item |
| `--x-sky-200` | `#a8cff4` | rings, beam tail, soft fills |
| `--x-sky-400` | `#4da3ff` | glow and icon gradients — never text |
| `--x-blue` | `#1a6eea` | buttons, switches, active chip |
| `--x-blue-deep` | `#0a4bbf` | hover/pressed on blue |
| `--x-text` / `--x-text-2` | `#0e1a33` / `#5f6b85` | text |
| `--x-quiet-fg` | `#0f5fd6` | text on `--x-sky-50` |
| `--x-ok`, `--x-warn`, `--x-err` (+ `-bg`) | `#0f7743`, `#a35a00`, `#c62f35` | statuses |
| `--x-shadow` / `--x-shadow-sm` | blue soft shadows | panels / chips and pills |
| `--x-hair` | `rgba(26,110,234,.10)` | separators |

Shapes: panels `--x-radius-panel` (1.75rem), cards/covers/screenshots `--x-radius-card` (1.5rem), buttons, fields, search, chips, badges, header, toasts `--x-radius-pill`. App icons: squircle radius 22.5%. Shadows are always blue, never grey. Text contrast ≥ 4.5:1.

## Type

Spec `docs/superpowers/specs/2026-11-17-typography-design.md`. Manrope 700 (`--x-font-head`) only for display, h1, h2; Inter (`--x-font`) for everything else, weights 400/500/600. Sizes only through `font: var(--x-type-display|h1|h2|h3|body|ui|cap)` (34→48, 28, 22, 17, 16, 14, 12 px), always with `letter-spacing: var(--x-track-head|body|small)` (.01em, .02em, .035em — «много воздуха»). No `font-size:` or literal `font:` in CSS modules; `apps/web/src/typography.test.ts` enforces it.

## Header

White floating glass pill (spec §5): top offset `.75rem + safe-area`, side `--x-gutter`; from 48em the pill is compact (fit-content, centred, owner 2026-11-19), on phones full width minus gutters; background `rgba(255,255,255,.78)` + `backdrop-filter: blur(12px) saturate(1.4)`, `--x-shadow`, 1px inner white ring. Active item `--x-sky-50` / `--x-quiet-fg`, the highlight slides between items (motion `layoutId`). After 24px of scroll it drops to 48px height (max 56rem wide). The word «Xstorex» (h2 type, «X» `--x-text`, «storex» `--x-blue`) leads the pill and links home; no logo image in the header (owner 2026-11-19/20), the mark lives in the footer. From 48em: a «Каталог» button opens a panel of sections under the pill (Aceternity Navbar Menu). Below 48em: only the word and a round menu button opening a Card Nav (cards «Каталог» starting with «Главная», «Доступ», «Помощь»); no «Тарифы» pill on phones (owner 2026-11-20).

Middle row for everyone: Блог · Вопросы · Поддержка. End slot (`navFor`): guest Тарифы + Войти; subscriber Мой доступ; signed in without access Тарифы + Мой доступ. «Выйти» is on `/access`. The word «аккаунт» never appears in the UI.

## Components

- Button: blue pill, white text, `0 6px 14px -6px var(--x-blue)` shadow, `:active` scale(.97), hover `--x-blue-deep`. Quiet: `--x-sky-50` / `--x-quiet-fg`.
- Search: white pill, `--x-shadow`, placeholder `--x-text-2`, focus ring `0 0 0 3px var(--x-sky-200)`.
- Chips: white pills with `--x-shadow-sm`; active chip blue with white text, highlight slides (Animated Background).
- Rails: snap scrolling, edges fade with progressive blur when there is more to scroll.
- App row tap on icon opens Morphing Dialog preview; title link still goes to `/app/[slug]`.
- Toasts (Sonner): `--x-text` pill, white text.
- Borrowed components keep their license note in a comment and are ported to CSS Modules on these tokens; no Tailwind.

## Rules

1. Mobile-first: 390px first, then 768px and 1280px.
2. Tokens only; a new color or size goes into `tokens.css` and its test first.
3. Every interactive element has `:focus-visible` and honours `prefers-reduced-motion` (no slides, no beam, no shimmer).
4. One bright motion moment (Morphing Dialog); no scroll-in section animations.

## Verification

1. Open the page at 390, 768 and 1280px in the built-in browser.
2. Compare with the palette mock and the «before» screenshots in `/mnt/project-files/screenshots/2026-11-17/`.
3. Check hover, active, focus and reduced motion; no horizontal scroll.
4. Report remaining differences honestly.
