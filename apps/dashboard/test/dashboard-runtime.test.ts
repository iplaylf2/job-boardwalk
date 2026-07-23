// @vitest-environment node

import { sleep } from "@shajara/host";
import type { RiteCoroutine } from "@shajara/host";
import { expect, test } from "vitest";

import { createDashboardRuntime } from "#/dashboard-runtime.js";

const immediateDelayMilliseconds = 0;

function* failWith(error: Error): RiteCoroutine<never> {
  yield* sleep(immediateDelayMilliseconds);
  throw error;
}

function* succeedWith<Return>(value: Return): RiteCoroutine<Return> {
  yield* sleep(immediateDelayMilliseconds);
  return value;
}

test("keeps one rejected UI operation from closing the page runtime", async () => {
  const runtime = createDashboardRuntime();
  const expectedError = new Error("synthetic rejected change");
  try {
    await expect(runtime.run(failWith(expectedError))).rejects.toBe(expectedError);
    await expect(runtime.run(succeedWith("available"))).resolves.toBe("available");
  } finally {
    await runtime.close();
  }
});
