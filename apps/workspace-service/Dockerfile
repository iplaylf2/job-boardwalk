# syntax=docker/dockerfile:1

# This image only bootstraps the toolchain selected by package.json and pnpm-lock.yaml.
FROM ghcr.io/pnpm/pnpm:latest AS build

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/workspace-service/package.json apps/workspace-service/package.json
COPY internal/presets/package.json internal/presets/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/platform-catalog/package.json packages/platform-catalog/package.json

RUN pnpm runtime set node \
    "$(pnpm --silent pkg get devEngines.runtime.version)" \
    --global && \
    install -D -m 0755 "$(command -v node)" /opt/job-boardwalk/node

RUN --mount=type=cache,id=job-boardwalk-pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --filter @job-boardwalk/workspace-service... --frozen-lockfile

COPY apps/workspace-service/ apps/workspace-service/
COPY internal/presets/ internal/presets/
COPY packages/contracts/ packages/contracts/
COPY packages/platform-catalog/ packages/platform-catalog/

RUN pnpm --filter @job-boardwalk/workspace-service build

FROM docker.io/library/node:lts-bookworm-slim

ENV JOB_BOARDWALK_WORKSPACE_DATABASE_PATH=/var/lib/job-boardwalk/workspace.sqlite \
    JOB_BOARDWALK_WORKSPACE_SERVICE_HOST=0.0.0.0 \
    JOB_BOARDWALK_WORKSPACE_SERVICE_PORT=54310 \
    NODE_ENV=production

WORKDIR /app

RUN apt-get update && \
    apt-get install --yes --no-install-recommends libatomic1 && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /opt/job-boardwalk/node /usr/local/bin/node
COPY --from=build --chown=node:node /workspace/apps/workspace-service/dist/workspace-service/ ./

RUN install -d -o node -g node -m 0700 /var/lib/job-boardwalk

USER node

EXPOSE 54310

CMD ["node", "index.mjs"]
