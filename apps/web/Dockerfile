# syntax=docker/dockerfile:1
# Build context: repo root (docker build -f apps/web/Dockerfile .).

FROM node:24-bookworm-slim AS base
RUN npm install -g pnpm@12.16.1

FROM base AS pruner
RUN npm install -g turbo@2.11.10
WORKDIR /app
COPY . .
RUN turbo prune @xstore/web --docker

FROM base AS builder
ENV TURBO_TELEMETRY_DISABLED=1 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY --from=pruner /app/out/full/ .
# turbo prune does not copy root files outside workspaces; every tsconfig extends this one.
COPY tsconfig.base.json ./
# Both are read by `next build`: the /api rewrite and the footer Telegram link are baked in.
ARG API_INTERNAL_URL
ARG NEXT_PUBLIC_TELEGRAM_URL
RUN pnpm exec turbo run build --filter=@xstore/web

FROM node:24-bookworm-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends wget \
  && rm -rf /var/lib/apt/lists/*
# HOSTNAME must be set: Docker sets it to the container id, and server.js binds to it.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
