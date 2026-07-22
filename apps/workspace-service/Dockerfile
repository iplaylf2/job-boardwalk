# syntax=docker/dockerfile:1.7

FROM ghcr.io/pnpm/pnpm:11.15.1 AS pnpm

FROM docker.io/library/node:26.5.0-bookworm-slim AS build

ENV PNPM_HOME=/pnpm

COPY --from=pnpm /opt/pnpm /opt/pnpm

RUN ln -s /opt/pnpm/pnpm /usr/local/bin/pnpm

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/workspace-service/package.json apps/workspace-service/package.json
COPY internal/presets/package.json internal/presets/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/platform-catalog/package.json packages/platform-catalog/package.json

RUN --mount=type=cache,id=job-boardwalk-pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --filter @job-boardwalk/workspace-service... --frozen-lockfile

COPY apps/workspace-service/ apps/workspace-service/
COPY internal/presets/ internal/presets/
COPY packages/contracts/ packages/contracts/
COPY packages/platform-catalog/ packages/platform-catalog/

RUN pnpm --filter @job-boardwalk/workspace-service build

FROM docker.io/library/node:26.5.0-bookworm-slim

ENV JOB_BOARDWALK_WORKSPACE_DATABASE_PATH=/var/lib/job-boardwalk/workspace.sqlite \
    JOB_BOARDWALK_WORKSPACE_SERVICE_HOST=0.0.0.0 \
    JOB_BOARDWALK_WORKSPACE_SERVICE_PORT=54310 \
    NODE_ENV=production

WORKDIR /app

COPY --from=build --chown=node:node /workspace/apps/workspace-service/dist/ ./

RUN install -d -o node -g node -m 0700 /var/lib/job-boardwalk

USER node

EXPOSE 54310

CMD ["node", "workspace-service.mjs"]
