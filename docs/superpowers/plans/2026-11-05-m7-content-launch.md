# M7 Content, Operations and Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xstore is ready for real users on its own VPS: blog, FAQ, support and legal pages managed from the admin; every email logged; an admin dashboard, audit log and settings; SEO (sitemap, robots, OpenGraph, PWA web clip); error tracking and health checks; daily backups with a tested restore; deploys from GitHub Actions over SSH with migrations and rollback.

**Architecture:**
- API `content` module (Markdown stored, sanitized HTML rendered on the server), `admin-dashboard`, `settings` registry.
- Worker notifications gain `NotificationLog` and SMTP settings from the admin (password encrypted, decrypted only in the worker).
- Web: content pages, `/install`, `sitemap.ts`, `robots.ts`, `manifest.ts`, security headers.
- Infra: worker replicas and health endpoint, `backup` service, `deploy.yml` workflow with a deploy script on the server.

**Tech Stack:** M6 stack plus `unified` 11 + `remark-parse` + `remark-gfm` + `remark-rehype` + `rehype-sanitize` + `rehype-stringify`, `@sentry/node` and `@sentry/nextjs` 10.x (any Sentry-protocol tracker, e.g. GlitchTip), `qrcode` 1.5.x, MinIO client `mc` (pinned by digest) in the backup image, `appleboy/ssh-action` pinned by commit SHA.

**Spec:** `docs/superpowers/specs/2026-11-02-xstore-design.md` — §3.1 (`content`, `notifications`, `admin`), §5 (`Article`, `FaqItem`, `Page`, `AuditLog`, `NotificationLog`, `Setting`), §6.3 (`/blog`, `/blog/[slug]`, `/faq`, `/support`, `/terms`, `/privacy`, `/install`, home blog block, admin dashboard, content, audit log, settings), §6.4, §7 (HSTS, Markdown sanitizing, terms and complaint procedure), §8 (logs, healthchecks, error tracker hook), §9 («Перед релизом»), §10, §11 → M7, §13 (VPS, DNS, SMTP from the owner).

## Owner decisions this plan depends on

1. **SMTP password is entered in the admin settings** and stored encrypted; only the worker decrypts it. `SMTP_URL` in env stays as the fallback.
2. **Legal texts come from the owner.** `/terms`, `/privacy` and `/support` stay unpublished (404) until the owner publishes their text in the admin; launch is blocked on it. `/terms` must forbid uploading IPAs without distribution rights and describe the complaint procedure (spec §7).
3. **CSP allows inline scripts** (`script-src 'self' 'unsafe-inline'`) for the first release because Next.js injects inline bootstrap scripts; a nonce-based CSP is a follow-up.
4. **Releases are git tags `v*`** that deploy after the owner approves the `production` environment in GitHub.
5. **Backups go to a second location** that the owner provides as an S3-compatible endpoint (second VPS with MinIO or any S3 storage).

## Global Constraints

- All M0–M6 Global Constraints hold.
- Markdown: CommonMark + GFM tables and lists; raw HTML is dropped; links get `rel="noopener noreferrer nofollow"` when external; images only from `S3_PUBLIC_URL`.
- Private routes are `noindex` and disallowed in `robots.txt`: `/admin`, `/api`, `/devices`, `/profile`, `/signer`, `/checkout`, `/enroll`, `/signin`, `/signout`, `/dev`.
- Migrations are expand/contract: a release never drops or renames a column that the previous release still reads.
- Backup schedule: `pg_dump -Fc` daily at 03:30 Europe/Moscow, 14 daily copies kept locally and remotely; originals bucket mirrored daily; restore check weekly.
- Worker replicas: `WORKER_REPLICAS` (default 2). Every scheduled job uses `upsertJobScheduler` with a fixed id, so replicas never duplicate schedules.
- Error tracker: enabled only when `ERROR_TRACKER_DSN` is set; request bodies, cookies and headers are stripped before sending.

## Review Focus

1. **Hostile Markdown** (`<script>`, `<img onerror>`, `javascript:` and `data:` links, raw `<iframe>`): rendered without any of it → Task 1 test `sanitizes hostile markdown`.
2. **SMTP down or wrong password:** the triggering action still succeeds, the mail is retried, `NotificationLog` shows `failed` with a short reason, an alert appears after the last attempt → Task 4 int test `smtp failure is logged, not fatal`.
3. **Sitemap and robots leakage:** drafts, hidden apps, unpublished articles and private routes never appear → Task 6 tests `sitemap lists only public content`, `robots disallows private routes`.
4. **Deploy with a failing migration:** running services are untouched and the workflow fails → Task 9 test `deploy aborts before touching services`.
5. **Backups that do not restore:** the weekly check restores the latest dump into a scratch database and fails loudly on errors → Task 8 test `restore check catches a broken dump`.

---

### Task 1: Content model and Markdown rendering

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (+ migration `m7_content`)
- Create: `apps/api/src/content/{content.module,markdown,content.controller,content.service}.ts`, `packages/shared/src/content.ts`
- Test: `apps/api/src/content/markdown.test.ts`, `apps/api/test/content.int.test.ts`

**Interfaces:**
- Produces (Prisma): `enum ContentStatus { draft published }`; `Article { id; slug @unique; title; excerpt; bodyMd; coverKey?; status; publishedAt?; createdAt; updatedAt }`; `FaqItem { id; question; answerMd; sort Int; status }`; `Page { slug String @id /* support|terms|privacy */; title; bodyMd; status; updatedAt }`.
- Produces:
  - `renderMarkdown(md: string, opts: { mediaOrigin: string }): string` — the unified pipeline above with a `rehype-sanitize` schema extended only by `rel` on links and `loading="lazy"` on images.
  - Public: `GET /content/articles?cursor=` → `Page<ArticleCard>` (12 per page, `publishedAt` desc), `GET /content/articles/:slug` → `{ …, html }`, `GET /content/faq` → `{ question, html }[]`, `GET /content/pages/:slug` → `{ title, html, updatedAt }`. Drafts → 404.

- [ ] **Step 1: Write the failing tests**

```ts
it('sanitizes hostile markdown', () => {
  const html = renderMarkdown('<script>x</script>\n\n[a](javascript:alert(1)) ![i](https://evil/x.png) <img src=x onerror=alert(1)>', O);
  expect(html).not.toMatch(/<script|javascript:|onerror|evil/);
});
it('keeps GFM tables and lists', () => { /* | a | b | → <table> */ });
it('marks external links', () => { expect(renderMarkdown('[t](https://t.me/x)', O)).toContain('rel="noopener noreferrer nofollow"'); });
// content.int.test.ts
it('drafts are not public', async () => { /* 404 */ });
```

- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement** (`pnpm db:migrate --name m7_content`).
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(content): articles, FAQ and pages with sanitized Markdown"`

---

### Task 2: Public content pages and `/install`

**Files:**
- Create: `apps/web/app/(site)/blog/page.tsx`, `apps/web/app/(site)/blog/[slug]/page.tsx`, `apps/web/app/(site)/faq/page.tsx`, `apps/web/app/(site)/[page]/page.tsx` (only `support`, `terms`, `privacy`; anything else `notFound()`), `apps/web/app/(site)/install/page.tsx`, `apps/web/src/content/{ArticleCard,Prose,FaqList}.tsx`
- Modify: `apps/web/app/(site)/page.tsx` (blog block when articles exist)
- Create: `apps/web/public/install/step-{1,2,3}.svg` (own drawings)
- Test: `apps/web/e2e/content.spec.ts`

**Interfaces:**
- Produces:
  - `/blog`: cards (cover 16:10, title, excerpt, date «5 ноября 2026»), «Показать ещё»; empty state «Скоро здесь появятся статьи».
  - `/blog/[slug]`: title, date, cover, `Prose`, JSON-LD `BlogPosting`.
  - `/faq`: `FaqList` of `<details>` items, JSON-LD `FAQPage`.
  - `/support`, `/terms`, `/privacy`: `Prose` with «Обновлено …».
  - Home: «Блог» section with the last 3 articles before the footer, hidden when there are none.
  - `/install`: on iOS Safari three steps («Нажмите „Поделиться“», «„На экран Домой“», «Откройте Xstore с экрана Домой»); elsewhere a QR code (server-rendered SVG of `SITE_URL/install`) with «Откройте на iPhone».

- [ ] **Step 1: Write the failing e2e tests** — `blog list and article`, `faq opens an answer`, `unpublished terms are 404`, `install page shows steps on iPhone and a QR code on desktop`, `no horizontal overflow at 320px` on `/blog` and `/faq`.
- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.** Design skill «Verification» at 390px and 1280px.
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): blog, FAQ, support and legal pages, install guide"`

---

### Task 3: Admin content

**Files:**
- Create: `apps/api/src/admin-content/{admin-content.module,articles.controller,faq.controller,pages.controller}.ts`
- Create: `apps/web/app/admin/content/{page.tsx,articles/[id]/page.tsx,faq/page.tsx,pages/[slug]/page.tsx}`, `apps/web/src/admin/MarkdownEditor.tsx`
- Test: `apps/api/test/admin-content.int.test.ts`

**Interfaces:**
- Produces (admin, audited): articles CRUD + publish/unpublish (slug via `uniqueSlug(slugify(title))`, editable) + cover upload (presigned PUT into media, as M1 app media); FAQ CRUD + `PUT /admin/faq/order { ids }`; pages `GET/PUT /admin/pages/:slug` + publish. `POST /admin/content/preview { md }` → `{ html }` for the editor's preview tab.

- [ ] **Step 1: Write the failing tests** — `publishing sets publishedAt once`, `preview uses the same sanitizer`, `support role cannot edit`.
- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): blog, FAQ and pages editor"`

---

### Task 4: Notification log and SMTP settings

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (+ migration `m7_notifications`), `apps/worker/src/notifications/{mailer,templates}.ts`, `apps/worker/src/queues/notifications.ts`
- Create: `packages/shared/src/settings.ts` (registry), `apps/api/src/settings/{settings.module,settings.controller}.ts`
- Test: `apps/worker/src/notifications/templates.test.ts`, `apps/worker/test/notification-log.int.test.ts`, `apps/api/test/settings.int.test.ts`

**Interfaces:**
- Produces (Prisma): `NotificationLog { id; template; to; subject; status String /* sent|failed */; error String?; jobId; createdAt }`.
- Produces:
  - `settingsRegistry`: every setting used since M1 with its zod schema, default and Russian label — `catalog.topRatedMinVotes`, `devices.lowSlotsThreshold`, `apple.minMembershipDays`, `apple.certRotateDays`, `apple.membershipWarnDays`, `signing.cacheTtlDays`, `signing.cacheMaxGb`, `signer.uploadRetentionDays`, `smtp` (`{ host, port, secure, user, from, passwordEnc? }`). `readSetting` (M1) validates against it.
  - `GET /admin/settings` (password shown as `{ set: true }` only), `PUT /admin/settings/:key` (admin, audited without secret values; `smtp.password` is encrypted with `encryptSecret` and stored as `passwordEnc`), `POST /admin/settings/smtp/test { to }` → sends `smtp-test`.
  - Worker mailer: SMTP from the `smtp` setting (password decrypted) or `SMTP_URL`; transport rebuilt when `Setting.updatedAt` changes.
  - Every send writes `NotificationLog`; the last failed attempt raises `smtp_failing` (dedupe per hour).
  - Templates reviewed together for tone and consistency: `email-code`, `admin-alert`, `device-active`, `reinstall-apps`, `order-paid`, `right-expiring`, `right-expired`, `smtp-test`; one shared HTML layout (logo, blue header line, footer «Xstore · xstorex.ru»), plain-text part for each.

- [ ] **Step 1: Write the failing tests** — `every template renders subject, text and escaped HTML` (table test over all templates), `smtp failure is logged, not fatal` (Mailpit stopped → order still paid, log `failed`, alert after last attempt), `settings never return the SMTP password`, `invalid setting values are refused`.
- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(notifications): delivery log, SMTP settings and unified templates"`

---

### Task 5: Admin dashboard, audit log and settings pages

**Files:**
- Create: `apps/api/src/admin-dashboard/{admin-dashboard.module,dashboard.controller,dashboard.service,audit.controller}.ts`
- Create: `apps/web/app/admin/page.tsx` (dashboard replaces the redirect), `apps/web/app/admin/audit/page.tsx`, `apps/web/app/admin/settings/page.tsx`, `apps/web/src/admin/StatTile.tsx`
- Test: `apps/api/test/dashboard.int.test.ts`

**Interfaces:**
- Produces:
  - `GET /admin/dashboard` (support and admin) → `{ revenueRub: { today, d7, d30 }, newDevices: { d7, d30 }, freeSlots: { tier, iphone, ipad }[], queues: { name, waiting, active, delayed, failed }[], revokedCertificates30d, signingFailures24h, openAlerts }`.
  - `GET /admin/audit?entity=&actorId=&from=&to=&cursor=` → 50 per page, newest first.
  - Dashboard page: stat tiles (per the `dataviz` skill for numbers and the `xstore-design` tokens), queue table, link to open alerts; settings page renders the registry as a form.

- [ ] **Step 1: Write the failing tests** — `revenue counts paid orders only, refunds subtracted`, `free slots per tier and class`, `audit filters by entity`.
- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): dashboard, audit log and settings"`

---

### Task 6: SEO and web app manifest

**Files:**
- Create: `apps/web/app/sitemap.ts`, `apps/web/app/robots.ts`, `apps/web/app/manifest.ts`, `apps/web/app/opengraph-image.png` (own artwork, 1200×630)
- Create: `apps/api/src/catalog/sitemap.controller.ts` (`GET /catalog/sitemap`)
- Modify: `apps/web/app/layout.tsx` (`metadataBase`, default OpenGraph, `alternates.canonical` per page), `(account)` and admin layouts (`robots: { index: false }`)
- Test: `apps/web/app/sitemap.test.ts`, `apps/web/app/robots.test.ts`, `apps/web/e2e/seo.spec.ts`

**Interfaces:**
- Produces:
  - `GET /catalog/sitemap` → `{ apps: { slug, updatedAt }[], categories: string[], lists: string[], articles: { slug, updatedAt }[], pages: string[] }` — published only.
  - `sitemap()` → home, `/pricing`, `/faq`, `/blog`, `/install`, apps, categories, lists, articles, published pages, absolute URLs from `SITE_URL`; split into chunks of 50 000 with `generateSitemaps` when needed.
  - `robots()` → `allow: '/'`, `disallow` = private routes (Global Constraints), `sitemap: <SITE_URL>/sitemap.xml`.
  - `manifest()` → `{ name: 'Xstore', short_name: 'Xstore', lang: 'ru', start_url: '/', display: 'standalone', background_color: '#f3f4f6', theme_color: '#0c45b7', icons: [192, 512 PNG from the mark] }`.

- [ ] **Step 1: Write the failing tests** — `sitemap lists only public content` (mocked API with a hidden app absent), `robots disallows private routes`, e2e: `app page has canonical and og:image`, `devices page is noindex`.
- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): sitemap, robots, canonical URLs and web app manifest"`

---

### Task 7: Observability and hardening

**Files:**
- Create: `apps/api/src/common/error-tracker.ts`, `apps/worker/src/error-tracker.ts`, `apps/web/instrumentation.ts`, `apps/worker/src/health-server.ts`
- Modify: `infra/docker-compose.yml` (worker replicas, worker healthcheck, `stop_grace_period: 11m` for workers so a signing job can finish), `infra/Caddyfile` (security headers), `apps/web/next.config.ts` (CSP header), `apps/worker/src/queues/*.ts` (`upsertJobScheduler`)
- Test: `apps/worker/test/health.int.test.ts`, `apps/worker/test/schedulers.int.test.ts`, `apps/web/e2e/headers.spec.ts`

**Interfaces:**
- Produces:
  - `initErrorTracker(service: 'api' | 'worker' | 'web')` — no-op without `ERROR_TRACKER_DSN`; `beforeSend` removes `request.data`, `request.cookies`, `request.headers`, and any string matching `/PRIVATE KEY|xs_session=/`.
  - Worker `GET /health` on `WORKER_HEALTH_PORT=3002` (container network only) → `Health` with `db`, `redis`; compose healthcheck uses it.
  - Headers on `SITE_DOMAIN`: existing HSTS and `nosniff`, plus `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-Frame-Options: DENY`; Next sets `Content-Security-Policy: default-src 'self'; img-src 'self' data: <S3_PUBLIC_URL>; connect-src 'self' <S3_PUBLIC_URL>; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' <PLATEGA payment origin>`.

- [ ] **Step 1: Write the failing tests** — `worker health reports db and redis`, `two worker instances keep one schedule per job` (two `main` instances in-process → `getJobSchedulers()` length unchanged), e2e `security headers are present` (CSP, frame-ancestors, referrer policy).
- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS. Then `docker compose -f infra/docker-compose.yml up -d --build --wait` shows 2 healthy workers.
- [ ] **Step 5: Commit** — `git commit -m "feat(ops): error tracking hook, worker health, replicas and security headers"`

---

### Task 8: Backups and restore check

**Files:**
- Create: `infra/backup/{Dockerfile,crontab,backup.sh,restore-check.sh}`
- Modify: `infra/docker-compose.yml` (service `backup`, volume `backups`), `.env.example` (`BACKUP_S3_URL`, `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY`, `BACKUP_S3_BUCKET`)
- Create: `apps/api/src/internal/alerts.controller.ts` (`POST /internal/alerts`, `X-Internal-Token` from M5)
- Test: `infra/backup/test.sh` (runs in CI `docker` job against a throwaway compose project)

**Interfaces:**
- Produces:
  - `backup.sh`: `pg_dump -Fc` → `/backups/xstore-<YYYYMMDD-HHMM>.dump` → `mc cp` to `remote/<bucket>/db/` → `mc mirror --overwrite --remove=false local/<prefix>originals remote/<bucket>/originals` → delete local and remote dumps older than 14 days → on any failure `POST /api/v1/internal/alerts { kind: 'backup_failed' }` and exit non-zero.
  - `restore-check.sh`: newest dump → `pg_restore` into a scratch database `xstore_restore_check` → `SELECT count(*)` on `User`, `App`, `Order` must succeed → drop the scratch DB → alert on failure.
  - Cron in the container (Europe/Moscow): backup 03:30 daily, restore check 05:00 Sundays.

- [ ] **Step 1: Write the failing test** (`test.sh`): seed a few rows, run `backup.sh` against a local MinIO as the remote, run `restore-check.sh` (expect success), corrupt the dump, run again (expect a non-zero exit and an alert row: `restore check catches a broken dump`).
- [ ] **Step 2: Run it to verify it fails.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it to verify it passes.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(infra): daily backups to a second location with a weekly restore check"`

---

### Task 9: Continuous deployment

**Files:**
- Create: `.github/workflows/deploy.yml`, `infra/deploy.sh`, `infra/SERVER.md`
- Modify: `infra/docker-compose.yml` (`image: ghcr.io/<owner>/xstore-<app>:${XSTORE_TAG:-local}` next to the existing `build:`), `.github/workflows/ci.yml` (`docker` job also runs `infra/deploy.sh --self-test`)
- Test: `infra/deploy.test.sh`

**Interfaces:**
- Produces:
  - `deploy.yml`: on push of tag `v*`; job `images` builds and pushes the three images to GHCR with tags `<tag>` and `sha-<short>`; job `deploy` (environment `production`, owner approval) connects over SSH (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`) and runs `/opt/xstore/infra/deploy.sh <tag>`.
  - `deploy.sh <tag>`: `git fetch --tags && git checkout <tag>` → `XSTORE_TAG=<tag> docker compose pull` → `docker compose run --rm migrate` (failure → exit 1 before any running service changes: `deploy aborts before touching services`) → `docker compose up -d --wait` → `bash infra/smoke.sh` → success writes `.last-good-tag`; smoke failure → `XSTORE_TAG=$(cat .last-good-tag) docker compose up -d --wait` and exit 1.
  - `SERVER.md`: Ubuntu 24.04 LTS, Docker Engine + compose plugin, user `deploy` in the `docker` group, `ufw` allowing 22/80/443 only, `/opt/xstore` clone, `.env` with production values (`SITE_DOMAIN=xstorex.ru`, `DL_DOMAIN=dl.xstorex.ru`, strong passwords, `MASTER_KEY_V1`, `INTERNAL_TOKEN`, `AUTH_SECRET`, Platega, SMTP fallback, backup target, `ERROR_TRACKER_DSN`), DNS A records for both domains, first start, GHCR login with a read-only token.

- [ ] **Step 1: Write the failing test** (`deploy.test.sh`, a stub `docker` on `PATH` that records calls and fails on demand): `migration failure stops before up`, `smoke failure rolls back to the last good tag`, `success records the tag`.
- [ ] **Step 2: Run it to verify it fails.** Expected: FAIL.
- [ ] **Step 3: Implement the workflow, script and server guide; lint the workflow** — `docker run --rm -v "$(pwd):/repo" -w /repo rhysd/actionlint:latest -color`. Expected: no findings.
- [ ] **Step 4: Run the test to verify it passes.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "ci: tag-based deploy over SSH with migrations and rollback"`

---

### Task 10: Launch

- [ ] **Step 1: Full local gate** — `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm test:e2e`; `docker build --target test -f apps/worker/Dockerfile .`; `bash infra/backup/test.sh`; `bash infra/deploy.test.sh`. Expected: all pass.
- [ ] **Step 2: Owner inputs** — VPS and DNS ready (`xstorex.ru`, `dl.xstorex.ru`), SMTP credentials, backup target, Platega production keys, Apple accounts, published `/terms`, `/privacy`, `/support`, at least one published app with a filled «основание для распространения».
- [ ] **Step 3: First deploy** — tag `v1.0.0-rc.1`, approve, watch `deploy.yml`; `bash infra/smoke.sh` on the server passes; HTTPS certificates issued for both domains; `https://xstorex.ru/sitemap.xml` and `/robots.txt` correct.
- [ ] **Step 4: Pre-release manual check on a real iPhone (spec §9)** — profile sign-in shows «Проверено»; purchase with a real Platega payment; device registration; OTA install from the catalog; Signer install; the app launches; emails arrive (code, payment, device ready). Record the results in the release notes.
- [ ] **Step 5: Operations check** — a forced OCSP check, a test alert email, `restore-check.sh` run by hand on the server, a rollback drill (`deploy.sh <previous tag>`).
- [ ] **Step 6: Request review** — `superpowers:requesting-code-review` for the whole M7 branch and a final `backend-api-security` pass over the production configuration.
- [ ] **Step 7: Release** — tag `v1.0.0`; update README/CLAUDE.md (deploy, backups, settings, error tracker). Commit `docs: production operations`.
