import { EventEmitter } from "node:events";
import { createScope } from "@shajara/host";
import type { BrowserContext, Response } from "patchright";
import { expect, test } from "vitest";

import { AccessInterruptionDiagnostics } from "#/browser/access-interruption-diagnostics.js";
import { PlatformAccessObserver } from "#/browser/platform-access-observer.js";

const successStatus = 200;
const deniedStatus = 403;
const increment = 1;
const lastIndex = -1;
const expiryDelay = 180_000;
const observedAt = "2026-07-15T02:00:00.000Z";
const interruption = {
  evidence: "verification-page",
  interruption: "verification-required",
  observedAt,
  platformId: "51job",
  url: "https://jobs.51job.com/synthetic.html?token=synthetic-secret#private",
} as const;

function response(
  url = "https://we.51job.com/api/synthetic?token=synthetic-secret#private",
  resourceType = "fetch",
  status = successStatus,
): Response {
  return {
    headers: () => ({
      "content-type": "text/html; charset=utf-8",
      "punish-type": "synthetic-secret",
      "set-cookie": "synthetic-secret",
    }),
    request: () => ({ isNavigationRequest: () => false, resourceType: () => resourceType }),
    status: () => status,
    url: () => url,
  } as unknown as Response;
}

test("retains HTTP 200 HTML fetch and XHR metadata without credentials or header values", () => {
  const diagnostics = new AccessInterruptionDiagnostics(() => Date.parse(observedAt));
  diagnostics.recordResponse(response());
  diagnostics.recordResponse(response("https://we.51job.com/api/synthetic", "xhr", deniedStatus));
  const capture = diagnostics.createReport(interruption);
  expect(capture.responses).toEqual([
    {
      hasPunishTypeHeader: true,
      mimeType: "text/html",
      observedAt,
      platformId: "51job",
      resourceType: "fetch",
      status: 200,
      url: "https://we.51job.com/api/synthetic",
    },
    expect.objectContaining({ resourceType: "xhr", status: 403 }),
  ]);
  expect(capture.url).toBe("https://jobs.51job.com/synthetic.html");
  expect(JSON.stringify(capture)).not.toMatch(/synthetic-secret|private|set-cookie/u);
});

test("excludes other platforms, third parties, and static resources", () => {
  const diagnostics = new AccessInterruptionDiagnostics(() => Date.parse(observedAt));
  diagnostics.recordResponse(response("https://www.zhipin.com/synthetic", "document"));
  diagnostics.recordResponse(response("https://unrelated.example/synthetic"));
  diagnostics.recordResponse(response("https://we.51job.com/synthetic.js", "script"));
  expect(diagnostics.createReport(interruption).responses).toEqual([]);
});

test("bounds retained responses and expires them even without further requests", () => {
  let now = Date.parse(observedAt);
  const diagnostics = new AccessInterruptionDiagnostics(() => now);
  const total = 150;
  for (let index = 0; index < total; index += increment) {
    diagnostics.recordResponse(response(`https://we.51job.com/synthetic/${String(index)}`));
  }
  const retained = diagnostics.createReport(interruption).responses;
  expect(retained.length).toBeLessThan(total);
  expect(retained.at(lastIndex)?.url).toBe("https://we.51job.com/synthetic/149");
  now += expiryDelay;
  expect(diagnostics.createReport(interruption).responses).toEqual([]);
});

test("reports async response evidence when a later page read establishes verification", async () => {
  // eslint-disable-next-line unicorn/prefer-event-target -- BrowserContext uses Node events.
  const context = new EventEmitter();
  const diagnostics: unknown[] = [];
  const observer = new PlatformAccessObserver(
    context as unknown as BrowserContext,
    () => null,
    (diagnostic) => diagnostics.push(diagnostic),
  );
  const scope = createScope();
  const observation = scope.run(() => observer.run());
  try {
    await expect.poll(() => context.listenerCount("response")).toBe(increment);
    context.emit("response", response());
    expect(observer.observations).toEqual([]);
    expect(diagnostics).toEqual([]);
    observer.observePage({
      elements: [],
      text: "Access Verification\nPlease slide to verify that you're not a robot\nPlease slide to verify",
      url: interruption.url,
    });
    expect(diagnostics).toEqual([
      expect.objectContaining({
        interruption: "verification-required",
        responses: [expect.objectContaining({ resourceType: "fetch", status: successStatus })],
      }),
    ]);
  } finally {
    await scope[Symbol.asyncDispose]();
    await expect(observation).rejects.toThrow();
  }
});
