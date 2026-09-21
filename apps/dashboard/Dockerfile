# syntax=docker/dockerfile:1

# Bootstrap pnpm; the frozen install below supplies the project's locked Node.js runtime.
FROM ghcr.io/pnpm/pnpm:latest AS build

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches/ patches/
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

# Keep the pre-run dependency check from expanding the filtered install to the full workspace.
RUN pnpm --config.verify-deps-before-run=false --filter @job-boardwalk/dashboard build

FROM docker.io/library/caddy:2-alpine

ENV XDG_CONFIG_HOME=/tmp/caddy-config \
    XDG_DATA_HOME=/tmp/caddy-data \
    JOB_BOARDWALK_DASHBOARD_DIRECTORY=/srv

RUN setcap -r /usr/bin/caddy && \
    addgroup -S -g 10001 caddy && \
    adduser -S -D -H -u 10001 -G caddy caddy

COPY apps/dashboard/Caddyfile /etc/caddy/Caddyfile
COPY --from=build --chown=caddy:caddy /workspace/apps/dashboard/dist/ /srv/

USER caddy

EXPOSE 8080
