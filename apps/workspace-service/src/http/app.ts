import { Hono } from "hono";
import type { Context, Next } from "hono";

import type { Scope } from "@shajara/host";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";
import type { BrowserSessionPresenceTracker } from "#/runtime/browser-session-presence.js";

import { registerApiRoutes } from "./api-routes.js";
import { registerMcpEndpoint } from "./mcp-endpoint.js";

const badRequestStatus = 400;
const forbiddenStatus = 403;

function parseOrigin(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function localOriginGuard(context: Context, next: Next) {
  const origin = context.req.header("origin");
  if (context.req.method !== "GET" && origin) {
    const originUrl = parseOrigin(origin);
    if (!originUrl) {
      return Promise.resolve(context.json({ error: "Origin 必须是有效 URL" }, badRequestStatus));
    }
    if (originUrl.hostname !== "127.0.0.1" && originUrl.hostname !== "localhost") {
      return Promise.resolve(context.json({ error: "拒绝来自非本地页面的请求" }, forbiddenStatus));
    }
  }
  return next();
}

function registerLocalOriginGuard(app: Hono): void {
  app.use("/api/*", localOriginGuard);
  app.use("/mcp", localOriginGuard);
}

export interface WorkspaceServiceHttpDependencies {
  browserSessionPresenceTracker: BrowserSessionPresenceTracker;
  repository: WorkspaceRepository;
  serviceScope: Scope;
}

export function createWorkspaceServiceHttpApp(
  dependencies: WorkspaceServiceHttpDependencies,
): Hono {
  const app = new Hono();

  app.get("/health", (context) => context.json({ status: "ok" }));
  registerLocalOriginGuard(app);
  registerApiRoutes(
    app,
    dependencies.repository,
    dependencies.browserSessionPresenceTracker,
    dependencies.serviceScope,
  );
  registerMcpEndpoint(
    app,
    dependencies.repository,
    dependencies.browserSessionPresenceTracker,
    dependencies.serviceScope,
  );

  return app;
}
