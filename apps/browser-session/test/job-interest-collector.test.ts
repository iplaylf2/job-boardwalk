import type { BrowserContext, Page } from "patchright";
import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { JobInterestCollector } from "#/browser/job-interest-collector.js";
import type { JobInterestWriter } from "#/workspace-service/job-interest-writer.js";

test("contains a page-opening failure and keeps supervision alive", async () => {
  const navigationError = new Error("navigation aborted");
  const context = {
    newPage: () =>
      Promise.resolve({
        goto: () => Promise.reject(navigationError),
        url: () => "about:blank",
      } as unknown as Page),
    pages: () => [],
  } as unknown as BrowserContext;
  const writer = {
    *write() {
      yield* [];
      expect.unreachable("导航失败时不应写入快照");
    },
  } satisfies JobInterestWriter;
  const collector = new JobInterestCollector(context, writer, () => null);
  const errors: Error[] = [];
  const scope = createScope();
  const supervision = scope.run(() => collector.run((error) => errors.push(error)));
  let settled = false;
  const settlement = supervision
    .finally(() => {
      settled = true;
    })
    .catch(() => null);

  await expect.poll(() => errors).toEqual([navigationError]);
  expect(settled).toBe(false);

  await scope[Symbol.asyncDispose]();
  await expect(supervision).rejects.toThrow();
  await settlement;
});
