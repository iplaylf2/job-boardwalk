import { Hono } from "hono";
import type { Context, Next } from "hono";

import { registerMcpEndpoint } from "./mcp-endpoint.js";
import type { BrowserControl } from "#/browser/browser-control.js";
import type { Scope } from "@shajara/host";

const badRequestStatus = 400;
const forbiddenStatus = 403;
const internalServerErrorStatus = 500;

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
    if (originUrl.hostname !== "127.0.0.1" && originUrl.hostname !== "localhost") {
      return Promise.resolve(context.json({ error: "拒绝来自非本地页面的请求" }, forbiddenStatus));
    }
  }
  return next();
}

export function createBrowserSessionHttpApp(dependencies: BrowserSessionHttpDependencies): Hono {
  const app = new Hono();

  app.onError((error, requestContext) =>
    requestContext.json({ error: error.message }, internalServerErrorStatus),
  );
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
