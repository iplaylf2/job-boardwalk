import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, onTestFinished, test } from "vitest";

import { createDashboardHostServer } from "#/dashboard-host.js";
import type { DashboardHostOptions } from "#/dashboard-host.js";

const ephemeralPort = 0;
const methodNotAllowedStatus = 405;
const notFoundStatus = 404;
const okStatus = 200;

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  await new Promise<void>((resolve) => {
    server.listen(ephemeralPort, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Synthetic HTTP server did not expose a TCP address.");
  }
  return address.port;
}

async function close(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("owns the Dashboard static-resource and API HTTP boundaries", async () => {
  const dashboardDirectory = await mkdtemp(path.join(tmpdir(), "synthetic-dashboard-"));
  await mkdir(path.join(dashboardDirectory, "assets"));
  await writeFile(path.join(dashboardDirectory, "index.html"), "<h1>Synthetic Dashboard</h1>");
  await writeFile(path.join(dashboardDirectory, "assets", "app.js"), "window.synthetic = true;");
  onTestFinished(() => rm(dashboardDirectory, { force: true, recursive: true }));

  const workspaceServer = createServer((request, response) => {
    response.writeHead(okStatus, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ path: request.url }));
  });
  const workspaceServicePort = await listen(workspaceServer);
  onTestFinished(() => close(workspaceServer));

  const options: DashboardHostOptions = {
    dashboardDirectory,
    hostname: "127.0.0.1",
    port: ephemeralPort,
    workspaceServiceHostname: "127.0.0.1",
    workspaceServicePort,
  };
  const dashboardServer = createDashboardHostServer(options);
  const dashboardPort = await listen(dashboardServer);
  onTestFinished(() => close(dashboardServer));
  const dashboardUrl = `http://127.0.0.1:${dashboardPort}`;

  const pageResponse = await fetch(`${dashboardUrl}/jobs/synthetic`);
  expect(await pageResponse.text()).toBe("<h1>Synthetic Dashboard</h1>");
  expect(pageResponse.headers.get("content-security-policy")).toContain("default-src 'self'");
  expect(pageResponse.headers.get("permissions-policy")).toBe(
    "camera=(), geolocation=(), microphone=()",
  );
  expect(pageResponse.headers.get("referrer-policy")).toBe("no-referrer");
  expect(pageResponse.headers.get("x-content-type-options")).toBe("nosniff");

  const assetResponse = await fetch(`${dashboardUrl}/assets/app.js`);
  expect(await assetResponse.text()).toBe("window.synthetic = true;");
  expect(assetResponse.headers.get("content-type")).toBe("text/javascript; charset=utf-8");

  const apiResponse = await fetch(`${dashboardUrl}/api/synthetic`);
  expect(await apiResponse.json()).toEqual({ path: "/api/synthetic" });

  const unsupportedMethodResponse = await fetch(`${dashboardUrl}/jobs/synthetic`, {
    method: "POST",
  });
  expect(unsupportedMethodResponse.status).toBe(methodNotAllowedStatus);
  expect(unsupportedMethodResponse.headers.get("allow")).toBe("GET, HEAD");

  const escapedPathResponse = await fetch(`${dashboardUrl}/%2F..%2Foutside.txt`);
  expect(escapedPathResponse.status).toBe(notFoundStatus);
});
