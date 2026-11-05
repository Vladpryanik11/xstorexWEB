---
name: xstore-design
description: Use for any Xstore UI work — public pages, account area, admin, header, footer, components — to reproduce the diyorde.com visual language with exact tokens. Load before writing or changing any markup or CSS in apps/web or packages/ui.
---

# Xstore design system

Xstore copies the visual language of diyorde.com: tokens, spacing, components, header. It never copies DIYORDE assets: logo, illustrations, screenshots, texts. Logo, copy and imagery are Xstore's own. UI language is Russian only, no language switcher.

Spec: `docs/superpowers/specs/2026-11-02-xstore-design.md` (section 6).

## Tokens

```css
:root {
  --x-blue: #1a6eea;
  --x-blue-strong: #0167e5;
  --x-blue-ring: #2276f3;
  --x-ink: #062260;
  --x-text: #000;
  --x-text-2: #6b7280;
  --x-text-3: #8c97ae;
  --x-quiet: #8a8a8d;
  --x-link: #008bff;
  --x-page: #f3f4f6;
  --x-surface: #f0f3fa;
  --x-surface-2: #eceef5;
  --x-card: #fff;
  --x-hair: #8a8a8d33;
  --x-radius-card: 1.5rem;
  --x-radius-field: .875rem;
  --x-gutter: 1.25rem;
  --x-column: 33rem;
  --x-page-max: 70rem; /* ≥64em: clamp(70rem, 100vw - 10rem, 90rem) */
  --x-font: "Helvetica Neue", Helvetica, Inter, Arial, sans-serif;
  --x-system: -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, "Noto Sans", sans-serif;
  --x-header-gradient: linear-gradient(#0c45b7 0%, #134cbe 30%, #1c55c8 51%, #245dd0 69%, #3b75e9 100%);
  --x-glass: rgba(255,255,255,.2);
  --x-glass-shadow: inset 0 -1px 1px -.5px rgba(255,255,255,.2), inset 0 1px 1px -.5px rgba(255,255,255,.39);
  --x-ease: cubic-bezier(.23, 1, .32, 1);
  --x-ease-sheet: cubic-bezier(.32, .72, 0, 1);
}
/* component tokens: --x-star: #8e8e91; --x-cover-ring: inset 0 0 0 .5px rgba(6,34,96,.12); --x-radius-cover: .875rem */
/* hairline: 1px; .5px at ≥1.5dppx; .3333px at ≥2.5dppx */
```

## Header (must match exactly)

Reference: `docs/superpowers/specs/assets/header-logged-in.png`.

- Container: sticky, `z-index: 40`, background `--x-header-gradient`, inner `max-width: --x-page-max`, padding `.625rem --x-gutter`, min-height 2.5rem, total height 60px.
- A fixed 6px tint strip `#0c45b7` sits at the very top, under the iOS status bar.
- ≥48em: grid `minmax(max-content,1fr) auto minmax(max-content,1fr)`, column-gap 1rem. Logo in column 1, menu centered in column 2, end group in column 3 (gap .75rem).
- Logo: 38×38, radius 10px.
- Menu link: `--x-font` 14px/500, letter-spacing -0.042px, color `#e6edfb`, min-height 34px, padding 0 .75rem, radius 62.5rem, gap between links .125rem. Active (`aria-current="page"`): background `rgba(255,255,255,.2)`. Hover (fine pointer): `rgba(255,255,255,.14)`, transition background .16s.
- Quiet link («Войти», «Выйти»): color `rgba(230,237,251,.72)`, hover white, min-height 40px, padding 0 .5rem.
- Entry pill («Установить»): white text, background `--x-glass`, box-shadow `--x-glass-shadow`, min-height 40px, padding 0 1rem, radius 12.5rem, `:active` scale(.97).
- Guest: logo | Блог · Вопросы · Поддержка | Установить + Войти.
- Signed in: logo | Ваши устройства · Профиль · Блог · Вопросы · Поддержка | Выйти.
- <48em: menu row hidden. A 40×40 round glass burger button (three 2px bars, animate to ×) opens a full-screen side sheet: background `#f0f3fa`, slides in from the right .32s `--x-ease-sheet`. Items are 48px rows with radius .875rem and 24px icons in `--x-blue`; the active row is white.
- Home page variant: transparent over the hero, gradient fades in over the first 6rem of scroll (`animation-timeline: scroll(root)`).

## Components

- **Button `.btn`:** background `--x-blue`, white text, 1px white border, radius 12.5rem, min-height 3.5rem, padding .75rem 1.5rem, 16px/500. Shadow: `inset 0 -1px 5px rgba(255,255,255,.4), inset 0 -1px 2px rgba(199,226,255,.4), 0 0 0 1px rgba(26,110,234,.18), 0 6px 14px -6px rgba(26,110,234,.45)`. `:active` scale(.97). Disabled: opacity .6. Quiet variant: white background, black text, hairline ring.
- **Search:** glass pill, background `rgba(255,255,255,.8)`, `backdrop-filter: blur(7.5px)`, color `--x-ink`, min-height 2.75rem, padding 0 .8125rem, gap .6875rem, max-width 33rem, shadow `0 2px 15px rgba(33,70,128,.25)`. Input 14px/500, placeholder `#3a507a`. Focus adds a ring `0 0 0 3px rgba(255,255,255,.55)`.
- **Rail:** horizontal flex, `overflow-x: auto`, `scroll-snap-type: x`, hidden scrollbar, padding-inline `--x-gutter`. Desktop arrows: 40px white circles that appear on hover.
- **Rows grid (`grid3`):** columns of 3 rows. Row min-height 3.625rem, gap .625rem. Icon about 56px with iOS squircle radius 22.5%, title 15px/500, subtitle 13px `--x-text-2`, hairline separator.
- **Icons row:** about 76px icons with the name underneath, 2 lines max.
- **Chips:** white, radius 1.125rem, height 2.25rem, padding 0 .75rem 0 .6875rem, 13px/600, shadow `0 4px 10px rgba(207,207,207,.65)`. Active chip: background `--x-ink`, white text.
- **Section title:** `--x-system` 17px/700, black, with a chevron link «›».
- **Cover:** 16:10, radius .875rem, background `--x-surface`, inner hairline `inset 0 0 0 .5px rgba(6,34,96,.12)`.
- **Spot banners (hero carousel):** large rounded cards with an image, title and subtitle at the bottom over a gradient.
- **Floating install banner:** fixed bottom center, bottom offset `.5rem + safe-area`, rounded blue card with the Xstore mark, «Xstore / Больше приложений» and a white «Установить» pill.
- **Footer:** background `#f0f3fa`, logo + «Xstore», Telegram icon. ≥48em: padding 2.5rem 0 3rem.
- **Stars:** color `#8e8e91`, 10px.
- **App page:** 120px icon, name about 28px/700, subtitle `--x-text-2`, blue «Установить» pill. Facts strip has 5 columns separated by hairlines: label 10px uppercase `--x-text-3`, value 17px/600. Screenshots rail uses gap 1.5rem and radius about 1.5rem. Description, then an «Информация» key/value list with hairlines.

## Rules

1. Mobile-first: design at 390px first, then 768px and 1280px.
2. Use tokens only. A new color or size goes into the tokens first.
3. Every interactive element gets a `:focus-visible` ring and honours `prefers-reduced-motion`.
4. Never ship DIYORDE files (logo, `brand-mark.webp`, screenshots, article text). Reference screenshots in `docs/` are internal only.

## Verification

Before calling any UI work done:

1. Open the page in the built-in browser at 390px and 1280px widths.
2. Open diyorde.com in a second tab at the same widths.
3. Compare spacing, sizes, colors and states (hover, active, focus) side by side.
4. For the header, also compare against `header-logged-in.png`.
5. Report remaining differences honestly.
