import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import type { BrowserToolBackend } from "#/browser/tool-backend.js";
import { createBrowserSessionHttpApp } from "#/http/app.js";

const mcpRequestHeaders = {
  accept: "application/json, text/event-stream",
  "content-type": "application/json",
};
const successfulStatus = 200;
const forbiddenStatus = 403;

const idleBrowserBackend: BrowserToolBackend = {
  *execute() {
    yield* [];
    throw new Error("browser call was not expected");
  },
  status: { connected: false, origin: "http://localhost" },
};

function listTools(app: ReturnType<typeof createBrowserSessionHttpApp>) {
  return app.request("/mcp", {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/list" }),
    headers: mcpRequestHeaders,
    method: "POST",
  });
}

test("keeps the browser connection outside downstream HTTP request lifetimes", async () => {
  await using serviceScope = createScope();
  const app = createBrowserSessionHttpApp({
    browserBackend: idleBrowserBackend,
    serviceScope,
  });

  const firstResponse = await listTools(app);
  expect(firstResponse.status).toBe(successfulStatus);
  expect(await firstResponse.json()).toMatchObject({
    result: {
      tools: expect.arrayContaining([expect.objectContaining({ name: "browser_snapshot" })]),
    },
  });
  const secondResponse = await listTools(app);
  expect(secondResponse.status).toBe(successfulStatus);
});

test("exposes a loopback health endpoint independently of CDP readiness", async () => {
  await using serviceScope = createScope();
  const app = createBrowserSessionHttpApp({
    browserBackend: idleBrowserBackend,
    serviceScope,
  });

  const response = await app.request("/health");
  expect(response.status).toBe(successfulStatus);
  expect(await response.json()).toEqual({
    browser: { connected: false, origin: "http://localhost" },
    status: "ok",
  });
});

test("rejects browser requests from a non-local web origin", async () => {
  await using serviceScope = createScope();
  const app = createBrowserSessionHttpApp({
    browserBackend: idleBrowserBackend,
    serviceScope,
  });

  const response = await app.request("/mcp", {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/list" }),
    headers: { ...mcpRequestHeaders, origin: "https://example.invalid" },
    method: "POST",
  });

  expect(response.status).toBe(forbiddenStatus);
  expect(await response.json()).toEqual({ error: "拒绝来自非本地页面的请求" });
});
