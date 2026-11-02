# M0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working Xstore monorepo: API, worker with zsign, web shell with the exact diyorde.com header and footer, local and production Docker, and CI. Every later milestone (M1–M7) builds on it.

**Architecture:** pnpm + Turborepo monorepo of ESM TypeScript packages.
- `apps/api` (NestJS 12) and `apps/worker` (BullMQ) share contracts from `packages/shared` and the Prisma client from `packages/db`.
- `apps/web` (Next.js 16) renders the shell from `packages/ui` tokens and components.
- Caddy fronts everything in Docker.

**Tech Stack:** Node.js 24, pnpm 12.16.1, Turborepo 2.11, TypeScript 6.0.3, NestJS 12.3, Next.js 16.4, React 19.3, Prisma 7.10.1, BullMQ 6.5, zod 4, Vitest 5.1, Playwright 1.64, Biome 2.6.4, PostgreSQL 17, Redis 7, MinIO, Caddy 2, zsign v1.1.3.

**Spec:** `docs/superpowers/specs/2026-11-02-xstore-design.md` (sections 3, 6.1, 6.2, 8, 9, 10, 11 → M0). Design values: `.claude/skills/xstore-design/SKILL.md`.

## Global Constraints

- Versions are exact as listed in Tech Stack. TypeScript stays on 6.0.3: `@nestjs/cli` 12 depends on `typescript ~6.0.2`.
- Every package is ESM: `"type": "module"`, `module`/`moduleResolution` `NodeNext` for Node packages, `Bundler` for web/ui.
- Package names: `@xstore/shared`, `@xstore/db`, `@xstore/ui`, `@xstore/api`, `@xstore/worker`, `@xstore/web`.
- Ports: web `3000`, api `3001`. API prefix `/api/v1`.
- Site copy is Russian only. No i18n library, no language switcher.
- Header, footer and component values come from `.claude/skills/xstore-design/SKILL.md` exactly. No DIYORDE files (logo, images, text) enter the repo outside `docs/`.
- API error body is `{ code, message }` with a Russian `message`. Internal details (stack, SQL, connection strings) never reach the client.
- Secrets live only in `.env` (git-ignored). `.env.example` is committed with dev-only values.
- Line endings are LF (`.gitattributes`).
- The repo path contains a space and Cyrillic (`C:\Users\Влад\xSTOREx website`). Every script quotes paths and never assumes an ASCII cwd.
- Docker Desktop must be running from Task 2 on.

## Review Focus

1. **iPhone SE width (320px):** the header (logo, «Установить», burger) fits without horizontal page scroll → Task 6 e2e `no horizontal overflow at 320px`.
2. **Tablet width (768px) signed in:** five menu items plus «Выйти» stay on one line; the header stays 60px tall → Task 6 e2e `auth header fits at 768px`.
3. **iPhone notch / status bar:** the viewport uses `viewport-fit=cover` and the 6px top tint is present → Task 6 test `layout viewport is cover`.
4. **DB or Redis down:** `/api/v1/health` returns 503 with per-check statuses only. No error text or connection string leaks → Task 3 int test `degraded health hides details`.
5. **Mobile menu by keyboard:** Escape closes the side sheet and focus returns to the burger → Task 6 e2e `side sheet closes on Escape`.

---

### Task 1: Monorepo foundation and shared contracts

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `biome.json`, `.gitattributes`, `.editorconfig`, `.nvmrc`, `.env.example`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/errors.ts`, `packages/shared/src/health.ts`, `packages/shared/src/queues.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/src/errors.test.ts`, `packages/shared/src/health.test.ts`

**Interfaces:**
- Produces (from `@xstore/shared`):
  - `ErrorCode`: const object with keys `INTERNAL | VALIDATION | NOT_FOUND | UNAUTHORIZED | FORBIDDEN | RATE_LIMITED` (value = key), plus the type `ErrorCode`.
  - `apiErrorSchema`: `z.object({ code: z.enum(ErrorCode values), message: z.string().min(1) })`, plus the type `ApiError`.
  - `healthSchema`: `z.object({ status: z.enum(['ok','degraded']), checks: z.record(z.string(), z.enum(['up','down'])) })`, plus the type `Health`.
  - `QueueName`: `{ system: 'system' } as const`, plus the type `SystemPingResult = { pong: true; at: string }` (ISO date).
- Root scripts used by every later task: `build`, `dev`, `lint`, `format`, `typecheck`, `test`, `test:int`, `test:e2e`, `infra:up`, `infra:down`, `db:migrate`.

- [ ] **Step 1: Check the toolchain**

Run: `node -v; npm install -g pnpm@12.16.1; pnpm -v`
Expected: `v24.x`, then `12.16.1`.

- [ ] **Step 2: Create the root config**
  - Root `package.json`: `"private": true`, `"type": "module"`, `"packageManager": "pnpm@12.16.1"`, `"engines": { "node": ">=24" }`. Scripts call `turbo run <task>` except:
    - `lint`: `biome check .`
    - `format`: `biome format --write .`
    - `infra:up`: `docker compose -f infra/docker-compose.dev.yml up -d --wait`
    - `infra:down`: `docker compose -f infra/docker-compose.dev.yml down`
    - `db:migrate`: `pnpm --filter @xstore/db migrate:dev`
  - `turbo.json`:
    - `build`: depends on `^build`, outputs `dist/**`, `.next/**` (excluding `.next/cache/**`).
    - `typecheck` and `test`: depend on `^build`.
    - `test:int` and `test:e2e`: depend on `^build`, `cache: false`.
    - `dev`: `persistent: true`, `cache: false`.
  - `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `target ES2023`, `module/moduleResolution NodeNext`, `declaration`, `sourceMap`, `skipLibCheck`, `verbatimModuleSyntax`.
  - `biome.json`: formatter with 2 spaces, line width 100, single quotes; linter on recommended rules; ignore `dist`, `.next`, `**/generated/**`.
  - `.gitattributes`: `* text=auto eol=lf`, `*.png binary`, `*.jpg binary`, `*.ipa binary`.
  - `.env.example`: every variable from the env table in Task 2 and Task 3, with dev values.

- [ ] **Step 3: Write the failing tests**

```ts
// packages/shared/src/errors.test.ts
it('accepts a known error', () => {
  expect(apiErrorSchema.parse({ code: 'NOT_FOUND', message: 'Не найдено' }))
    .toEqual({ code: 'NOT_FOUND', message: 'Не найдено' });
});
it('rejects an unknown code', () => {
  expect(apiErrorSchema.safeParse({ code: 'FOO', message: 'x' }).success).toBe(false);
});
it('rejects an empty message', () => {
  expect(apiErrorSchema.safeParse({ code: 'INTERNAL', message: '' }).success).toBe(false);
});

// packages/shared/src/health.test.ts
it('parses a healthy report', () => {
  expect(healthSchema.parse({ status: 'ok', checks: { db: 'up', redis: 'up' } }).status).toBe('ok');
});
it('rejects an unknown check state', () => {
  expect(healthSchema.safeParse({ status: 'ok', checks: { db: 'maybe' } }).success).toBe(false);
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm install && pnpm --filter @xstore/shared test`
Expected: FAIL — modules `./errors` and `./health` not found.

- [ ] **Step 5: Implement `errors.ts`, `health.ts` and `queues.ts` with the Interfaces above; re-export everything from `index.ts`**

The package builds with `tsc` to `dist/`. `exports` points to `./dist/index.js` and types to `./dist/index.d.ts`. Scripts: `build`, `typecheck` (`tsc --noEmit`), `test` (`vitest run src`).

- [ ] **Step 6: Run the tests and checks**

Run: `pnpm --filter @xstore/shared test && pnpm build && pnpm typecheck && pnpm lint`
Expected: 5 tests pass. Build, typecheck and lint are clean.

- [ ] **Step 7: Normalize line endings and commit**

Run: `git add --renormalize . && git ls-files --eol | grep -v "i/lf" | grep -v "i/-text"`
Expected: no output (every text file is LF in the index).

```bash
git add -A
git commit -m "chore: monorepo foundation and shared contracts"
```

---

### Task 2: Dev infrastructure and database package

**Files:**
- Create: `infra/docker-compose.dev.yml`, `infra/postgres/init/01-test-db.sql`
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/prisma.config.ts`, `packages/db/prisma/schema.prisma`, `packages/db/src/client.ts`, `packages/db/src/index.ts`, `packages/db/vitest.config.ts`, `packages/db/test/global-setup.ts`
- Create: `packages/db/prisma/migrations/<timestamp>_init/migration.sql` (generated)
- Test: `packages/db/test/setting.int.test.ts`

**Interfaces:**
- Produces:
  - `createPrismaClient(databaseUrl: string): PrismaClient`. Uses `PrismaPg` from `@prisma/adapter-pg`.
  - Re-exports `PrismaClient` and the generated model types.
- Env:

| Variable | Dev value |
|---|---|
| `DATABASE_URL` | `postgresql://xstore:xstore@localhost:5432/xstore` |
| `DATABASE_URL_TEST` | `postgresql://xstore:xstore@localhost:5432/xstore_test` |
| `REDIS_URL` | `redis://localhost:6379/0` |
| `REDIS_URL_TEST` | `redis://localhost:6379/1` |
| `MINIO_ROOT_USER` | `xstore` |
| `MINIO_ROOT_PASSWORD` | `xstore-dev-secret` |

- [ ] **Step 1: Check that Docker is running**

Run: `docker version --format '{{.Server.Version}}' && docker compose version`
Expected: both print versions. If not, stop and ask the owner to install or start Docker Desktop.

- [ ] **Step 2: Write `infra/docker-compose.dev.yml`**
  - `postgres:17-alpine`: user, password and db all `xstore`. Mounts `./postgres/init` at `/docker-entrypoint-initdb.d`. Healthcheck `pg_isready`. Port 5432.
  - `redis:7-alpine`: healthcheck `redis-cli ping`. Port 6379.
  - `minio/minio`: command `server /data --console-address :9001`. Ports 9000 and 9001. Credentials from env.
  - Named volumes for all three.
  - `01-test-db.sql` contains `CREATE DATABASE xstore_test;`.

Run: `pnpm infra:up`
Expected: three containers healthy.

- [ ] **Step 3: Write the failing test**

```ts
// packages/db/test/setting.int.test.ts
it('stores and reads a JSON setting', async () => {
  const db = createPrismaClient(process.env.DATABASE_URL_TEST!);
  await db.setting.upsert({
    where: { key: 'devices.lowSlotsThreshold' },
    create: { key: 'devices.lowSlotsThreshold', value: 10 },
    update: { value: 10 },
  });
  const row = await db.setting.findUniqueOrThrow({ where: { key: 'devices.lowSlotsThreshold' } });
  expect(row.value).toBe(10);
  expect(row.updatedAt).toBeInstanceOf(Date);
  await db.$disconnect();
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @xstore/db test:int`
Expected: FAIL — `createPrismaClient` not exported.

- [ ] **Step 5: Implement the Prisma 7 setup**
  - `schema.prisma`:
    - generator `prisma-client`, output `../src/generated/prisma`;
    - datasource `postgresql`;
    - `model Setting { key String @id; value Json; updatedAt DateTime @updatedAt }`.
  - `prisma.config.ts` takes the URL from `DATABASE_URL`, using root `.env` loaded via `process.loadEnvFile` when present.
  - `client.ts` exports `createPrismaClient`.
  - `test/global-setup.ts` runs `prisma migrate deploy` with `DATABASE_URL=DATABASE_URL_TEST`, then truncates `"Setting"`.
  - Scripts:
    - `build` (`prisma generate && tsc`);
    - `migrate:dev` (`prisma migrate dev`);
    - `migrate:deploy`;
    - `test:int` (`vitest run test`).

Run: `pnpm db:migrate --name init`
Expected: migration `<timestamp>_init` created and applied to `xstore`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @xstore/db test:int`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add infra packages/db .env.example
git commit -m "feat(db): dev infrastructure and Prisma client with Setting model"
```

---

### Task 3: API service skeleton

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json`, `apps/api/nest-cli.json`, `apps/api/vitest.config.ts` (uses `unplugin-swc` 2.0.0 + `@swc/core` 1.16.21 for decorator metadata)
- Create: `apps/api/src/main.ts`, `apps/api/src/app.module.ts`
- Create: `apps/api/src/config/config.ts`
- Create: `apps/api/src/common/api-exception.filter.ts`, `apps/api/src/common/to-api-error.ts`, `apps/api/src/common/request-id.ts`
- Create: `apps/api/src/infra/prisma.service.ts`, `apps/api/src/infra/redis.provider.ts`
- Create: `apps/api/src/health/health.controller.ts`, `apps/api/src/health/health.service.ts`
- Test: `apps/api/src/config/config.test.ts`, `apps/api/src/common/to-api-error.test.ts`, `apps/api/test/health.int.test.ts`

**Interfaces:**
- Consumes: `apiErrorSchema`, `ErrorCode`, `healthSchema`, `Health` from `@xstore/shared`; `createPrismaClient` from `@xstore/db`.
- Produces:
  - `loadConfig(env: NodeJS.ProcessEnv): AppConfig`, where `AppConfig = { databaseUrl: string; redisUrl: string; port: number; logLevel: 'debug'|'info'|'warn'|'error'; siteUrl: string }`. Parsed with zod from `DATABASE_URL`, `REDIS_URL`, `API_PORT`, `LOG_LEVEL`, `SITE_URL`. Defaults: `port 3001`, `logLevel 'info'`. On invalid input it throws an `Error` whose message lists every invalid variable name.
  - `toApiError(err: unknown): { status: number; body: ApiError }`.
  - `createApp(config: AppConfig): Promise<INestApplication>`. Builds the app without listening, so tests reuse it.
  - `GET /api/v1/health` returns `Health`: 200 when all checks are `up`, otherwise 503.
- Env (add to `.env.example`): `API_PORT=3001`, `LOG_LEVEL=info`, `SITE_URL=http://localhost:3000`.

- [ ] **Step 1: Write the failing unit tests**

```ts
// config.test.ts
it('parses a valid env', () => {
  expect(loadConfig({ DATABASE_URL: 'postgresql://a', REDIS_URL: 'redis://b', SITE_URL: 'http://localhost:3000' }))
    .toMatchObject({ port: 3001, logLevel: 'info' });
});
it('names every missing variable', () => {
  expect(() => loadConfig({})).toThrow(/DATABASE_URL.*REDIS_URL|REDIS_URL.*DATABASE_URL/s);
});

// to-api-error.test.ts
it('maps NotFoundException', () => {
  expect(toApiError(new NotFoundException())).toEqual({ status: 404, body: { code: 'NOT_FOUND', message: 'Не найдено' } });
});
it('maps ZodError to 400 VALIDATION', () => {
  const err = z.object({ a: z.string() }).safeParse({}).error;
  expect(toApiError(err)).toMatchObject({ status: 400, body: { code: 'VALIDATION' } });
});
it('hides unknown errors', () => {
  expect(toApiError(new Error('password=secret'))).toEqual({
    status: 500, body: { code: 'INTERNAL', message: 'Внутренняя ошибка сервера' },
  });
});
```

Russian messages by code:
- `NOT_FOUND` «Не найдено»
- `UNAUTHORIZED` «Требуется вход»
- `FORBIDDEN` «Нет доступа»
- `RATE_LIMITED` «Слишком много запросов, попробуйте позже»
- `VALIDATION` «Некорректные данные»
- `INTERNAL` «Внутренняя ошибка сервера»

- [ ] **Step 2: Run the unit tests to verify they fail**

Run: `pnpm --filter @xstore/api test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `loadConfig` and `toApiError`, and wire `ApiExceptionFilter` (global) to use `toApiError`**

The filter logs unknown errors with pino at `error` level, including the request id, and sends only the mapped body.

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `pnpm --filter @xstore/api test`
Expected: 5 tests pass.

- [ ] **Step 5: Write the failing integration tests**

```ts
// apps/api/test/health.int.test.ts — app from createApp(config with DATABASE_URL_TEST, REDIS_URL_TEST)
it('reports ok', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ status: 'ok', checks: { db: 'up', redis: 'up' } });
});
it('echoes or creates x-request-id', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/health').set('x-request-id', 'abc');
  expect(res.headers['x-request-id']).toBe('abc');
  const res2 = await request(app.getHttpServer()).get('/api/v1/health');
  expect(res2.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
});
it('returns the error contract for unknown routes', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/nope');
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ code: 'NOT_FOUND', message: 'Не найдено' });
});
it('degraded health hides details', async () => {
  const broken = await createApp({ ...config, redisUrl: 'redis://127.0.0.1:1' });
  const res = await request(broken.getHttpServer()).get('/api/v1/health');
  expect(res.status).toBe(503);
  expect(res.body).toEqual({ status: 'degraded', checks: { db: 'up', redis: 'down' } });
  await broken.close();
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `pnpm --filter @xstore/api test:int`
Expected: FAIL — `createApp` not exported or route missing.

- [ ] **Step 7: Implement `createApp`, `HealthController`/`HealthService`, `PrismaService`, the redis provider, request-id middleware and `nestjs-pino` logging**
  - Global prefix: `api/v1`.
  - Each health check runs with a 1 s timeout: `SELECT 1` via Prisma and `PING` via ioredis.
  - The redis client uses `lazyConnect`, `maxRetriesPerRequest: 1` and `enableOfflineQueue: false`, so a dead Redis fails fast.
  - `main.ts` loads root `.env` via `process.loadEnvFile` when the file exists, then calls `createApp(loadConfig(process.env))` and `listen(config.port)`.

- [ ] **Step 8: Run all API tests**

Run: `pnpm --filter @xstore/api test && pnpm --filter @xstore/api test:int`
Expected: 5 unit and 4 integration tests pass.

- [ ] **Step 9: Run the server by hand**

Run: `pnpm --filter @xstore/api dev`, then in another shell `curl -s localhost:3001/api/v1/health`
Expected: `{"status":"ok","checks":{"db":"up","redis":"up"}}`, with a JSON log line in the dev shell.

- [ ] **Step 10: Commit**

```bash
git add apps/api .env.example pnpm-lock.yaml
git commit -m "feat(api): NestJS skeleton with config, error contract, logging and health"
```

---

### Task 4: Worker service skeleton

**Files:**
- Create: `apps/worker/package.json`, `apps/worker/tsconfig.json`, `apps/worker/vitest.config.ts`
- Create: `apps/worker/src/config.ts`, `apps/worker/src/queues/system.ts`, `apps/worker/src/main.ts`
- Test: `apps/worker/src/config.test.ts`, `apps/worker/test/system.int.test.ts`

**Interfaces:**
- Consumes: `QueueName`, `SystemPingResult` from `@xstore/shared`.
- Produces:
  - `loadWorkerConfig(env): { redisUrl: string; logLevel: 'debug'|'info'|'warn'|'error'; concurrency: number }`. Default `concurrency: 4` from `WORKER_CONCURRENCY`.
  - `createSystemWorker(connection: ConnectionOptions): Worker<unknown, SystemPingResult>`. Handles job name `ping` on queue `QueueName.system`. Any other job name throws `UnknownJobError`.
  - `main.ts` starts the worker and closes it on `SIGTERM`/`SIGINT` before exiting with code 0.

- [ ] **Step 1: Write the failing tests**

```ts
// config.test.ts
it('requires REDIS_URL', () => { expect(() => loadWorkerConfig({})).toThrow(/REDIS_URL/); });
it('defaults concurrency to 4', () => {
  expect(loadWorkerConfig({ REDIS_URL: 'redis://x' }).concurrency).toBe(4);
});

// test/system.int.test.ts — queue + QueueEvents on REDIS_URL_TEST, queue obliterated before each test
it('answers ping', async () => {
  const job = await queue.add('ping', {});
  const result = await job.waitUntilFinished(events, 5000);
  expect(result.pong).toBe(true);
  expect(new Date(result.at).toString()).not.toBe('Invalid Date');
});
it('fails unknown jobs', async () => {
  const job = await queue.add('nope', {}, { attempts: 1 });
  await expect(job.waitUntilFinished(events, 5000)).rejects.toThrow(/Unknown job: nope/);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @xstore/worker test && pnpm --filter @xstore/worker test:int`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `loadWorkerConfig`, `createSystemWorker` and `main.ts` (pino logger, graceful shutdown)**

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm --filter @xstore/worker test && pnpm --filter @xstore/worker test:int`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/worker .env.example pnpm-lock.yaml
git commit -m "feat(worker): BullMQ worker skeleton with system ping queue"
```

---

### Task 5: UI tokens and base components

**Files:**
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/vitest.config.ts` (jsdom, `@testing-library/react`)
- Create: `packages/ui/src/tokens.css`, `packages/ui/src/index.ts`
- Create: `packages/ui/src/button/Button.tsx` + `Button.module.css`
- Create: `packages/ui/src/search/SearchField.tsx` + `.module.css`
- Create: `packages/ui/src/chip/Chip.tsx` + `.module.css`
- Create: `packages/ui/src/rail/Rail.tsx` + `.module.css`
- Create: `packages/ui/src/section/SectionTitle.tsx` + `.module.css`
- Test: `packages/ui/src/button/Button.test.tsx`, `packages/ui/src/chip/Chip.test.tsx`, `packages/ui/src/section/SectionTitle.test.tsx`, `packages/ui/src/rail/Rail.test.tsx`

**Interfaces:**
- Produces (consumed as TS source by Next via `transpilePackages`; `exports` points to `./src/index.ts`, plus `./tokens.css`):
  - `Button(props: { variant?: 'primary'|'quiet'; href?: string; disabled?: boolean; children; ...native })` renders `<a>` when `href` is set, otherwise `<button type="button">`. When disabled it sets `aria-disabled="true"`, plus `disabled` on a button.
  - `SearchField(props: { placeholder?: string; defaultValue?: string; name?: string; onSubmit?: (q: string) => void; tone?: 'glass'|'page' })` renders `<form role="search">` with `<input type="search">`. Default placeholder: «Приложения, игры и другое».
  - `Chip(props: { href: string; icon?: ReactNode; active?: boolean; children })` renders a link. When `active` it sets `aria-current="page"`.
  - `Rail(props: { children: ReactNode[]; label: string })` renders a horizontal scroller `<ul aria-label={label}>`, one `<li>` per child.
  - `SectionTitle(props: { href?: string; children })` renders `<h2>`. With `href` the text is a link followed by a chevron «›».
- `tokens.css` holds the `:root` block from the design skill verbatim (`--x-*` names), plus the hairline media queries and `body { background: var(--x-page) }`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('Button renders a link when href is set', () => {
  render(<Button href="/pricing">Купить</Button>);
  expect(screen.getByRole('link', { name: 'Купить' })).toHaveAttribute('href', '/pricing');
});
it('Button disabled is aria-disabled', () => {
  render(<Button disabled>Установить</Button>);
  expect(screen.getByRole('button', { name: 'Установить' })).toHaveAttribute('aria-disabled', 'true');
});
it('Chip active sets aria-current', () => {
  render(<Chip href="/category/finance" active>Финансы</Chip>);
  expect(screen.getByRole('link', { name: 'Финансы' })).toHaveAttribute('aria-current', 'page');
});
it('SectionTitle with href shows a chevron link', () => {
  render(<SectionTitle href="/list/top">Самый загружаемый</SectionTitle>);
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Самый загружаемый›');
  expect(screen.getByRole('link')).toHaveAttribute('href', '/list/top');
});
it('Rail wraps each child in a list item', () => {
  render(<Rail label="Тенденции">{[<span key="a">A</span>, <span key="b">B</span>]}</Rail>);
  expect(screen.getByRole('list', { name: 'Тенденции' }).querySelectorAll('li')).toHaveLength(2);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @xstore/ui test`
Expected: FAIL — components not found.

- [ ] **Step 3: Implement the components with CSS Modules**

CSS values follow the skill's Components section exactly (button shadows, search glass, chip shadow, rail snap with hidden scrollbar and fine-pointer arrows, section title `--x-system` 17px/700).

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm --filter @xstore/ui test && pnpm --filter @xstore/ui typecheck`
Expected: 5 tests pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui pnpm-lock.yaml
git commit -m "feat(ui): design tokens and base components"
```

---

### Task 6: Web app shell — logo, header, footer, dev showcase

**Files:**
- Create: `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/tsconfig.json`, `apps/web/vitest.config.ts`, `apps/web/playwright.config.ts`
- Create: `apps/web/public/brand/mark.svg`, `apps/web/app/icon.svg`, `apps/web/app/apple-icon.png` (180×180, rendered from the mark)
- Create: `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/app/dev/ui/page.tsx`
- Create: `apps/web/src/shell/Header.tsx`, `Header.module.css`, `NavLinks.tsx` (client), `MobileMenu.tsx` (client), `nav.ts`
- Create: `apps/web/src/shell/Footer.tsx`, `Footer.module.css`
- Test: `apps/web/src/shell/nav.test.ts`, `apps/web/src/shell/Header.test.tsx`, `apps/web/app/layout.test.ts`, `apps/web/app/dev/ui/page.test.tsx`, `apps/web/e2e/header.spec.ts`, `apps/web/e2e/footer.spec.ts`

**Interfaces:**
- Consumes: `tokens.css`, `Button`, `SearchField` from `@xstore/ui`.
- Produces:
  - `navItems(signedIn: boolean): { href: string; label: string }[]`:
    - guest: `/blog` Блог, `/faq` Вопросы, `/support` Поддержка;
    - signed in: `/devices` Ваши устройства, `/profile` Профиль, `/blog` Блог, `/faq` Вопросы, `/support` Поддержка.
  - `Header(props: { signedIn: boolean; overHero?: boolean; forcedPath?: string })` (passes `forcedPath` to `NavLinks`):
    - guest end group: entry pill «Установить» → `/install` and quiet «Войти» → `/signin`;
    - signed-in end group: quiet «Выйти» → `/signout`.
  - `NavLinks(props: { items; forcedPath?: string })`: client component. Takes the path from `forcedPath ?? usePathname()` and sets `aria-current="page"` when `path === href` or `path.startsWith(href + '/')`.
  - `MobileMenu(props: { items; signedIn })`: burger `button[aria-label="Меню"][aria-expanded]` opens a side sheet `role="dialog" aria-modal="true"`. The sheet lists the items plus the end-group links. Escape and a second click close it; focus returns to the burger.
  - `Footer()`:
    - Xstore mark and «Xstore»;
    - links Блог, Вопросы, Поддержка, Условия (`/terms`), Конфиденциальность (`/privacy`);
    - «© 2026 Xstore»;
    - a Telegram icon link when `NEXT_PUBLIC_TELEGRAM_URL` is set.
  - `/dev/ui?auth=1&path=/devices&w=hero`: showcase of the header (variant from `auth`; `path` forces the active item through a `forcedPath` prop on `NavLinks`), every `@xstore/ui` component and the footer. It renders only when `XSTORE_DEV_PAGES=1`, otherwise `notFound()`.
  - `next.config.ts`:
    - `output: 'standalone'`;
    - `transpilePackages: ['@xstore/ui', '@xstore/shared']`;
    - rewrite `/api/:path*` → `${API_INTERNAL_URL}/api/:path*` when `API_INTERNAL_URL` is set.
  - `layout.tsx`:
    - `lang="ru"`, Inter via `next/font/google` (subsets `latin`, `cyrillic`, variable `--font-inter`; the token stack becomes `"Helvetica Neue", Helvetica, var(--font-inter), Arial, sans-serif`);
    - `export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0c45b7' }`;
    - renders `<Header signedIn={false} />` and `<Footer />` (auth arrives in M2).
  - `page.tsx`: a placeholder hero with the heading «Xstore — магазин приложений для iPhone» and a `SearchField`. M1 replaces it.

**Logo:** an original Xstore mark: a white rounded square with radius 22.5%, holding a bold geometric «X» from two rounded strokes in a `#0c45b7 → #3b75e9` gradient. Nothing derived from the DIYORDE glyph. It is shown at 38×38 with radius 10px in the header.

- [ ] **Step 1: Write the failing unit tests**

```ts
// nav.test.ts
it('guest menu', () => {
  expect(navItems(false).map(i => i.label)).toEqual(['Блог', 'Вопросы', 'Поддержка']);
});
it('signed-in menu', () => {
  expect(navItems(true).map(i => i.label)).toEqual(['Ваши устройства', 'Профиль', 'Блог', 'Вопросы', 'Поддержка']);
});

// Header.test.tsx (next/navigation mocked: usePathname → '/devices/abc')
it('signed-in header marks the active item and offers logout', () => {
  render(<Header signedIn />);
  expect(screen.getByRole('link', { name: 'Ваши устройства' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Выйти' })).toHaveAttribute('href', '/signout');
  expect(screen.queryByText('Русский')).toBeNull();
});
it('guest header offers install and login', () => {
  render(<Header signedIn={false} />);
  expect(screen.getByRole('link', { name: 'Установить' })).toHaveAttribute('href', '/install');
  expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/signin');
});

// layout.test.ts
it('layout viewport is cover', async () => {
  const { viewport } = await import('../app/layout');
  expect(viewport).toMatchObject({ viewportFit: 'cover', themeColor: '#0c45b7' });
});

// app/dev/ui/page.test.tsx (next/navigation mocked: notFound throws 'NEXT_NOT_FOUND')
it('dev showcase is hidden without the flag', async () => {
  delete process.env.XSTORE_DEV_PAGES;
  const { default: Page } = await import('./page');
  expect(() => Page({ searchParams: Promise.resolve({}) })).toThrow('NEXT_NOT_FOUND');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @xstore/web test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `nav.ts`, `Header`, `NavLinks`, `MobileMenu`, `Footer`, the logo files, `layout.tsx`, `page.tsx`, `/dev/ui` and `next.config.ts`**

Header CSS follows the skill's Header section value for value:
- gradient, 60px height, 6px fixed tint;
- grid at ≥48em; links 14px/500 in `#e6edfb`, 34px tall;
- active `rgba(255,255,255,.2)`, hover `.14`;
- quiet `rgba(230,237,251,.72)`;
- entry pill with `--x-glass-shadow`;
- below 48em the burger and the `#f0f3fa` side sheet sliding in .32s.

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `pnpm --filter @xstore/web test`
Expected: 6 tests pass.

- [ ] **Step 5: Write the failing e2e tests**

`playwright.config.ts`:
- projects: `mobile-webkit` (`devices['iPhone 15']`) and `desktop-chromium` (1280×800);
- `webServer`: `pnpm build && pnpm start -p 3100`, env `XSTORE_DEV_PAGES=1`;
- `baseURL`: `http://localhost:3100`.

```ts
// e2e/header.spec.ts
const css = (loc, prop) => loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test('header matches the reference values (desktop)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dev/ui?auth=1&path=/devices');
  const header = page.locator('header').first();
  expect((await header.boundingBox())!.height).toBe(60);
  expect(await css(header, 'background-image')).toContain('linear-gradient(rgb(12, 69, 183) 0%');
  const active = page.getByRole('link', { name: 'Ваши устройства' });
  expect(await css(active, 'background-color')).toBe('rgba(255, 255, 255, 0.2)');
  expect(await css(active, 'font-size')).toBe('14px');
  expect(await css(active, 'font-weight')).toBe('500');
  expect(await css(page.getByRole('link', { name: 'Профиль' }), 'color')).toBe('rgb(230, 237, 251)');
  expect(await css(page.getByRole('link', { name: 'Выйти' }), 'color')).toBe('rgba(230, 237, 251, 0.72)');
});
test('auth header fits at 768px', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/dev/ui?auth=1&path=/devices');
  expect((await page.locator('header').first().boundingBox())!.height).toBe(60);
  await expect(page.getByRole('link', { name: 'Ваши устройства' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('no horizontal overflow at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/dev/ui');
  await expect(page.getByRole('button', { name: 'Меню' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('side sheet closes on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev/ui?auth=1');
  const burger = page.getByRole('button', { name: 'Меню' });
  await burger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Профиль' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(burger).toBeFocused();
});

// e2e/footer.spec.ts
test('footer surface and links', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');
  expect(await css(footer, 'background-color')).toBe('rgb(240, 243, 250)');
  await expect(footer.getByRole('link', { name: 'Условия' })).toHaveAttribute('href', '/terms');
});
```

- [ ] **Step 6: Run the e2e tests to verify they fail, then fix until they pass**

Run: `pnpm --filter @xstore/web exec playwright install webkit chromium && pnpm --filter @xstore/web test:e2e`
Expected (first run): FAIL on any value not yet matching. Final: all e2e tests pass in both projects.

- [ ] **Step 7: Compare side by side with diyorde.com (design skill Verification)**
  1. Run `pnpm --filter @xstore/web dev` with `XSTORE_DEV_PAGES=1`.
  2. In the built-in browser, open `http://localhost:3000/dev/ui?auth=1&path=/devices` and `https://diyorde.com/` at 390px and 1280px.
  3. Compare the header against `docs/superpowers/specs/assets/header-logged-in.png`.

Expected: no visible difference in gradient, sizes, spacing, colors or hover/active states. List any difference that remains (for example, the font on Windows falls back to Inter) in the commit message body.

- [ ] **Step 8: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): app shell with exact header, footer, logo and dev showcase"
```

---

### Task 7: Production Docker images, compose, Caddy

**Files:**
- Create: `apps/api/Dockerfile`, `apps/worker/Dockerfile`, `apps/web/Dockerfile`, `.dockerignore`
- Create: `infra/docker-compose.yml`, `infra/Caddyfile`, `infra/smoke.sh`

**Interfaces:**
- Consumes: build outputs of every package; `migrate:deploy` from `@xstore/db`.
- Produces:
  - Images `xstore-api`, `xstore-worker` (contains `/usr/local/bin/zsign` v1.1.3) and `xstore-web` (Next standalone).
  - Compose services `caddy`, `web`, `api`, `worker`, `migrate` (one-off), `postgres`, `redis`, `minio`.
- Env (add to `.env.example`): `SITE_DOMAIN=localhost`, `DL_DOMAIN=dl.localhost`, `API_INTERNAL_URL=http://api:3001`, `WORKER_CONCURRENCY=4`, `POSTGRES_PASSWORD=xstore`.

- [ ] **Step 1: Write `infra/smoke.sh` — the failing check**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
curl -kfsS "https://localhost/api/v1/health" | grep -q '"status":"ok"'
curl -kfsS "https://localhost/" | grep -q 'Xstore'
docker compose -f docker-compose.yml exec -T worker zsign -v | grep -q '1.1.3'
echo "smoke: ok"
```

Run: `bash infra/smoke.sh`
Expected: FAIL — nothing is listening on 443.

- [ ] **Step 2: Write the Dockerfiles**
  - All three use `turbo prune @xstore/<app> --docker`, then `pnpm install --frozen-lockfile` and build, on `node:24-bookworm-slim`, running as the `node` user.
  - Worker adds a `zsign-build` stage on `debian:bookworm-slim`:
    1. `apt-get install -y git g++ make pkg-config libssl-dev ca-certificates`
    2. `git clone --depth 1 --branch v1.1.3 https://github.com/zhlynn/zsign`
    3. `make -C zsign/build/linux`
    4. Copy `zsign/bin/zsign` into the final image, which also installs `libssl3`.
  - The api image includes the Prisma CLI and migrations so the `migrate` service can run `pnpm --filter @xstore/db migrate:deploy`.

- [ ] **Step 3: Write `infra/docker-compose.yml` and `infra/Caddyfile`**
  - Caddy listens on 80/443 and serves `{$SITE_DOMAIN}`:
    - `handle /api/*` → `api:3001`;
    - `handle` → `web:3000`;
    - `encode zstd gzip`.
  - Caddy serves `{$DL_DOMAIN}` → `minio:9000`.
  - `api` and `worker` depend on `migrate` (`service_completed_successfully`). `migrate` depends on healthy `postgres`.
  - Healthchecks: api via `wget -qO- http://localhost:3001/api/v1/health`, web on `/`, postgres via `pg_isready`, redis via `redis-cli ping`.
  - Volumes: `pgdata`, `redisdata`, `miniodata`, `caddydata`.
  - `api` and `worker` get env from `../.env`.

- [ ] **Step 4: Build and start, then run the smoke check**

Run: `docker compose -f infra/docker-compose.yml --env-file .env up -d --build --wait && bash infra/smoke.sh`
Expected: `smoke: ok`.

- [ ] **Step 5: Shut down and commit**

Run: `docker compose -f infra/docker-compose.yml down`

```bash
git add apps/*/Dockerfile .dockerignore infra .env.example
git commit -m "feat(infra): production images, compose with Caddy and smoke check"
```

---

### Task 8: CI workflow and developer docs

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `CLAUDE.md` (section «Структура и команды»)
- Create: `README.md`

**Interfaces:**
- Consumes: root scripts from Task 1, compose files from Tasks 2 and 7.
- Produces: CI jobs `check`, `integration`, `e2e` and `docker`. All run on `pull_request` and on `push` to `main`.

- [ ] **Step 1: Write `ci.yml`**
  - Every job uses pnpm via `pnpm/action-setup` (version from `packageManager`) and `actions/setup-node` with Node 24 and the pnpm cache.
  - `check`: `pnpm install --frozen-lockfile`, `pnpm biome ci .`, `pnpm typecheck`, `pnpm test`.
  - `integration`:
    - services `postgres:17-alpine` (`POSTGRES_USER=xstore`, `POSTGRES_PASSWORD=xstore`, `POSTGRES_DB=xstore_test`) and `redis:7-alpine`;
    - env `DATABASE_URL_TEST`, `REDIS_URL_TEST`;
    - runs `pnpm test:int`.
  - `e2e`: `pnpm --filter @xstore/web exec playwright install --with-deps webkit chromium`, then `pnpm test:e2e`. Uploads `playwright-report` on failure.
  - `docker`: `docker build` for each of the three Dockerfiles (no push).

- [ ] **Step 2: Lint the workflow**

Run: `docker run --rm -v "$(pwd):/repo" -w /repo rhysd/actionlint:latest -color`
Expected: no findings.

- [ ] **Step 3: Write the docs**
  - `README.md` in Russian: what Xstore is, requirements (Node 24, pnpm 12.16.1, Docker Desktop), the first run (`cp .env.example .env`, `pnpm install`, `pnpm infra:up`, `pnpm db:migrate`, `pnpm dev`), the test commands, and the production compose and smoke check.
  - The `CLAUDE.md` section «Структура и команды» is replaced with the same command list and ports (web 3000, api 3001, Postgres 5432, Redis 6379, MinIO 9000/9001).

- [ ] **Step 4: Run the full local gate**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm test:e2e`
Expected: everything passes.

- [ ] **Step 5: Commit**

```bash
git add .github README.md CLAUDE.md
git commit -m "ci: GitHub Actions pipeline and developer docs"
```
