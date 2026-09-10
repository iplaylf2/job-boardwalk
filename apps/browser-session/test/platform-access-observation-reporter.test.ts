import type { PlatformAccessObservation } from "@job-boardwalk/contracts";
import { createScope, run } from "@shajara/host";
import { expect, test } from "vitest";

import { PlatformAccessObservationReporter } from "#/workspace-service/platform-access-observation-reporter.js";

const successfulStatus = 200;
const unavailableStatus = 503;
const expectedRequestCount = 1;
const firstRequestIndex = 0;

test("submits platform evidence independently of browser runtime state", async () => {
  const requests: { input: string | URL | Request; init?: RequestInit }[] = [];
  function fetchImplementation(input: string | URL | Request, init?: RequestInit) {
    requests.push({ input, ...(init ? { init } : {}) });
    return Promise.resolve(new Response(null, { status: 200 }));
  }
  const reporter = new PlatformAccessObservationReporter(
    new URL("http://workspace.test:54310"),
    () => [
      {
        authenticationState: "authenticated" as const,
        evidence: "protected-resource" as const,
        observedAt: "2026-07-15T02:00:00.000Z",
        platformId: "boss" as const,
      },
    ],
    fetchImplementation,
  );
  await using scope = createScope();

  await scope.run(() => reporter.report());

  expect(requests).toHaveLength(expectedRequestCount);
  expect(String(requests[firstRequestIndex]?.input)).toBe(
    "http://workspace.test:54310/api/platform-access/observations",
  );
  expect(requests[firstRequestIndex]?.init?.method).toBe("PUT");
  expect(JSON.parse(String(requests[firstRequestIndex]?.init?.body))).toEqual({
    authenticationState: "authenticated",
    evidence: "protected-resource",
    observedAt: "2026-07-15T02:00:00.000Z",
    platformId: "boss",
  });
});

test("sends no heartbeat and only resubmits evidence after a new observation", async () => {
  let observations: PlatformAccessObservation[] = [];
  const requests: string[] = [];
  const reporter = new PlatformAccessObservationReporter(
    new URL("http://workspace.test"),
    () => observations,
    (_url, init) => {
      requests.push(String(init?.body));
      return Promise.resolve(new Response(null, { status: 200 }));
    },
  );
  await run(() => reporter.report());
  expect(requests).toEqual([]);
  observations = [
    {
      authenticationState: "authenticated",
      evidence: "protected-resource",
      observedAt: "2026-07-15T02:00:00.000Z",
      platformId: "boss",
    },
  ];
  await run(() => reporter.report());
  await run(() => reporter.report());
  expect(requests).toHaveLength(expectedRequestCount);
  observations = [{ ...observations[firstRequestIndex]!, observedAt: "2026-07-15T02:05:00.000Z" }];
  await run(() => reporter.report());
  expect(
    requests.map((body) => (JSON.parse(body) as PlatformAccessObservation).observedAt),
  ).toEqual(["2026-07-15T02:00:00.000Z", "2026-07-15T02:05:00.000Z"]);
});

test("retries rejected evidence without replaying already accepted platforms", async () => {
  const observations: PlatformAccessObservation[] = [
    {
      authenticationState: "authenticated",
      evidence: "protected-resource",
      observedAt: "2026-07-15T02:00:00.000Z",
      platformId: "boss",
    },
    {
      authenticationState: "authenticated",
      evidence: "authenticated-page",
      observedAt: "2026-07-15T02:00:00.000Z",
      platformId: "yupao",
    },
  ];
  let rejectYupao = true;
  const requests: string[] = [];
  const reporter = new PlatformAccessObservationReporter(
    new URL("http://workspace.test"),
    () => observations,
    (_url, init) => {
      const observation = JSON.parse(String(init?.body)) as PlatformAccessObservation;
      requests.push(observation.platformId);
      return Promise.resolve(
        new Response(null, {
          status:
            rejectYupao && observation.platformId === "yupao"
              ? unavailableStatus
              : successfulStatus,
        }),
      );
    },
  );
  await expect(run(() => reporter.report())).rejects.toThrow();
  rejectYupao = false;
  await run(() => reporter.report());
  await run(() => reporter.report());
  expect(requests).toEqual(["boss", "yupao", "yupao"]);
});
