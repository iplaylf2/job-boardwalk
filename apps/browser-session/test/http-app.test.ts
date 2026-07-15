import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import type { BrowserControl } from "#/browser/browser-control.js";
import { createBrowserSessionHttpApp } from "#/http/app.js";

const mcpRequestHeaders = {
  accept: "application/json, text/event-stream",
  "content-type": "application/json",
};
const successfulStatus = 200;
const badRequestStatus = 400;
const forbiddenStatus = 403;

const unavailableBrowserControl: BrowserControl = {
  *executeTool() {
    yield* [];
    throw new Error("browser call was not expected");
  },
  status: { available: false },
};

function listTools(app: ReturnType<typeof createBrowserSessionHttpApp>) {
  return app.request("/mcp", {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/list" }),
    headers: mcpRequestHeaders,
    method: "POST",
  });
}

test("keeps tool discovery available across requests while the browser is unavailable", async () => {
  await using serviceScope = createScope();
  const app = createBrowserSessionHttpApp({
    browserControl: unavailableBrowserControl,
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

test("exposes a loopback health endpoint independently of browser readiness", async () => {
  await using serviceScope = createScope();
  const app = createBrowserSessionHttpApp({
    browserControl: unavailableBrowserControl,
    serviceScope,
  });

  const response = await app.request("/health");
  expect(response.status).toBe(successfulStatus);
  expect(await response.json()).toEqual({
    browser: { available: false },
    status: "ok",
  });
});

test.each([
  { expectedStatus: successfulStatus, name: "accepts localhost", origin: "http://localhost:54311" },
  { expectedStatus: badRequestStatus, name: "rejects a malformed origin", origin: "not a URL" },
  {
    expectedStatus: forbiddenStatus,
    name: "rejects an external origin",
    origin: "https://example.invalid",
  },
])("$name at the Browser Session trust boundary", async ({ expectedStatus, origin }) => {
  await using serviceScope = createScope();
  const app = createBrowserSessionHttpApp({
    browserControl: unavailableBrowserControl,
    serviceScope,
  });

  const response = await app.request("/mcp", {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/list" }),
    headers: { ...mcpRequestHeaders, origin },
    method: "POST",
  });

  expect(response.status).toBe(expectedStatus);
});
