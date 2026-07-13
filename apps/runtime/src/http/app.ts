import { Hono } from "hono";
import type { Context, Next } from "hono";

import type { Scope } from "@shajara/host";

import type { PlatformBrowser } from "#/browser/playwright-platform-browser.js";
import { registerMcpHttpEndpoint } from "#/mcp/http-endpoint.js";
import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

import { registerApiRoutes } from "./api-routes.js";

const badRequestStatus = 400;
const forbiddenStatus = 403;

function localOriginGuard(context: Context, next: Next) {
  const origin = context.req.header("origin");
  if (context.req.method !== "GET" && origin) {
    const originUrl = new URL(origin);
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

export function createRuntimeHttpApp(
  repository: WorkspaceRepository,
  runtimeScope: Scope,
  platformBrowser: PlatformBrowser,
): Hono {
  const app = new Hono();

  app.onError((error, context) => context.json({ error: error.message }, badRequestStatus));
  registerLocalOriginGuard(app);
  registerApiRoutes(app, repository, runtimeScope, platformBrowser);
  registerMcpHttpEndpoint(app, repository, runtimeScope, platformBrowser);

  return app;
}
