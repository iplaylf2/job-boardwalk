# syntax=docker/dockerfile:1.7

FROM ghcr.io/pnpm/pnpm:11.13.0 AS pnpm

FROM docker.io/library/node:26.5.0-bookworm-slim AS build

ENV PNPM_HOME=/pnpm

COPY --from=pnpm /opt/pnpm /opt/pnpm

RUN ln -s /opt/pnpm/pnpm /usr/local/bin/pnpm

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY internal/presets/package.json internal/presets/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/platform-catalog/package.json packages/platform-catalog/package.json

RUN --mount=type=cache,id=job-boardwalk-pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --filter @job-boardwalk/dashboard... --frozen-lockfile

COPY apps/dashboard/ apps/dashboard/
COPY internal/presets/ internal/presets/
COPY packages/contracts/ packages/contracts/
COPY packages/platform-catalog/ packages/platform-catalog/

RUN pnpm --filter @job-boardwalk/dashboard build

FROM docker.io/library/caddy:2.11.4-alpine

ENV XDG_CONFIG_HOME=/tmp/caddy-config \
    XDG_DATA_HOME=/tmp/caddy-data

RUN setcap -r /usr/bin/caddy && \
    addgroup -S -g 10001 caddy && \
    adduser -S -D -H -u 10001 -G caddy caddy

COPY apps/dashboard/Caddyfile /etc/caddy/Caddyfile
COPY --from=build --chown=caddy:caddy /workspace/apps/dashboard/dist/ /srv/

USER caddy

EXPOSE 8080
