# syntax=docker/dockerfile:1
# Build context: repo root (docker build -f apps/api/Dockerfile .).

FROM node:24-bookworm-slim AS base
# openssl lets Prisma pick the schema engine for OpenSSL 3; wget serves the compose healthcheck.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl wget \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@12.16.1

FROM base AS pruner
RUN npm install -g turbo@2.11.10
WORKDIR /app
COPY . .
RUN turbo prune @xstore/api --docker

FROM base AS builder
ENV TURBO_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY --from=pruner /app/out/full/ .
# turbo prune does not copy root files outside workspaces; every tsconfig extends this one.
COPY tsconfig.base.json ./
RUN pnpm exec turbo run build --filter=@xstore/api

# Keeps the whole pruned workspace with dev dependencies: the `migrate` service runs
# `pnpm --filter @xstore/db migrate:deploy`, which needs the Prisma CLI (a devDependency).
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app .
USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
