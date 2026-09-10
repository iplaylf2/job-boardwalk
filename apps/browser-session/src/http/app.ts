import { Hono } from "hono";
import type { Context, Next } from "hono";

import { registerMcpEndpoint } from "./mcp-endpoint.js";
import type { BrowserControl } from "#/browser/browser-control.js";
import type { Scope } from "@shajara/host";

const badRequestStatus = 400;
const forbiddenStatus = 403;

export interface BrowserSessionHttpDependencies {
  browserControl: BrowserControl;
  serviceScope: Scope;
}

function parseOrigin(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function localOriginGuard(context: Context, next: Next) {
  const origin = context.req.header("origin");
  if (origin) {
    const originUrl = parseOrigin(origin);
    if (!originUrl) {
      return Promise.resolve(context.json({ error: "Origin 必须是有效 URL" }, badRequestStatus));
    }
    if (
      (originUrl.hostname !== "127.0.0.1" && originUrl.hostname !== "localhost") ||
      (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") ||
      originUrl.origin !== origin
    ) {
      return Promise.resolve(context.json({ error: "拒绝来自非本地页面的请求" }, forbiddenStatus));
    }
  }
  return next();
}

function healthReadHeaders(context: Context, next: Next) {
  const origin = context.req.header("origin");
  context.header("Cache-Control", "no-store");
  context.header("Vary", "Origin");
  if (origin && context.req.method === "GET") {
    context.header("Access-Control-Allow-Origin", origin);
  }
  return next();
}

export function createBrowserSessionHttpApp(dependencies: BrowserSessionHttpDependencies): Hono {
  const app = new Hono();

  app.use("/health", localOriginGuard, healthReadHeaders);
  app.get("/health", (requestContext) =>
    requestContext.json({
      browser: dependencies.browserControl.status,
      status: "ok",
    }),
  );
  app.use("/mcp", localOriginGuard);
  registerMcpEndpoint(app, dependencies.browserControl, dependencies.serviceScope);

  return app;
}
