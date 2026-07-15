import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import {
  BrowserSessionStatusReporter,
  resolveWorkspaceServiceUrl,
} from "#/workspace-service/status-reporter.js";

const expectedRequestCount = 1;
const firstRequestIndex = 0;

test("reports the current browser status to Workspace Service", async () => {
  const requests: { input: string | URL | Request; init?: RequestInit }[] = [];
  function fetchImplementation(input: string | URL | Request, init?: RequestInit) {
    requests.push({ input, ...(init ? { init } : {}) });
    return Promise.resolve(new Response(null, { status: 200 }));
  }
  const reporter = new BrowserSessionStatusReporter(
    new URL("http://workspace.test:54310"),
    () => ({ available: true, browserVersion: "149.0", tabCount: 2 }),
    fetchImplementation,
  );
  await using scope = createScope();

  await scope.run(() => reporter.report());

  expect(requests).toHaveLength(expectedRequestCount);
  expect(String(requests[firstRequestIndex]?.input)).toBe(
    "http://workspace.test:54310/api/browser-session/status",
  );
  expect(JSON.parse(String(requests[firstRequestIndex]?.init?.body))).toEqual({
    browserStatus: { available: true, browserVersion: "149.0", tabCount: 2 },
  });
});

test("resolves an independently configured Workspace Service endpoint", () => {
  expect(
    resolveWorkspaceServiceUrl({
      JOB_BOARDWALK_WORKSPACE_SERVICE_URL: "https://workspace.example.test:8443",
    }).toString(),
  ).toBe("https://workspace.example.test:8443/");
  expect(() =>
    resolveWorkspaceServiceUrl({
      JOB_BOARDWALK_WORKSPACE_SERVICE_URL: "file:///tmp/workspace",
    }),
  ).toThrow(/HTTP/u);
});
