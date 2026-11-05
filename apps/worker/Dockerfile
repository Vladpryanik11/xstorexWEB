# syntax=docker/dockerfile:1
# Build context: repo root (docker build -f apps/worker/Dockerfile .).

FROM debian:bookworm-slim AS zsign-build
RUN apt-get update \
  && apt-get install -y --no-install-recommends git g++ make pkg-config libssl-dev ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /src
# VERSION is explicit: `git describe` on a shallow tag clone is not a stable version string.
RUN git clone --depth 1 --branch v1.1.3 https://github.com/zhlynn/zsign \
  && make -C zsign/build/linux VERSION=1.1.3

FROM node:24-bookworm-slim AS base
RUN npm install -g pnpm@12.16.1

FROM base AS pruner
RUN npm install -g turbo@2.11.10
WORKDIR /app
COPY . .
RUN turbo prune @xstore/worker --docker

FROM base AS builder
ENV TURBO_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY --from=pruner /app/out/full/ .
# turbo prune does not copy root files outside workspaces; every tsconfig extends this one.
COPY tsconfig.base.json ./
RUN pnpm exec turbo run build --filter=@xstore/worker

FROM base AS prod-deps
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod --store-dir /pnpm/store

FROM node:24-bookworm-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends libssl3 \
  && rm -rf /var/lib/apt/lists/*
COPY --from=zsign-build /src/zsign/bin/zsign /usr/local/bin/zsign
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app .
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/db/dist packages/db/dist
COPY --from=builder /app/packages/ios/dist packages/ios/dist
COPY --from=builder /app/apps/worker/dist apps/worker/dist
USER node
CMD ["node", "apps/worker/dist/main.js"]
