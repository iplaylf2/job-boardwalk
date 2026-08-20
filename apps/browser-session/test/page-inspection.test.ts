import type { Page } from "patchright";
import { errors } from "patchright";
import { createScope } from "@shajara/host";
import { expect, test } from "vitest";

import { inspectPageDocument } from "#/browser/page-inspection.js";

function fakePage(input: { closed?: boolean; result?: object; error?: Error }): Page {
  return {
    isClosed: () => input.closed ?? false,
    locator: () => ({
      evaluate: () => (input.error ? Promise.reject(input.error) : Promise.resolve(input.result)),
    }),
  } as unknown as Page;
}

test("reports the observed document lifecycle", async () => {
  await using scope = createScope();
  const result = await scope.run(() =>
    inspectPageDocument(
      fakePage({
        result: {
          documentReadyState: "interactive",
          outcome: "observed",
          title: "Synthetic jobs",
        },
      }),
    ),
  );

  expect(result).toEqual({
    documentReadyState: "interactive",
    outcome: "observed",
    title: "Synthetic jobs",
  });
});

test("distinguishes a timed-out inspection from a closed page", async () => {
  await using scope = createScope();
  const timedOut = await scope.run(() =>
    inspectPageDocument(fakePage({ error: new errors.TimeoutError("synthetic timeout") })),
  );
  const closed = await scope.run(() => inspectPageDocument(fakePage({ closed: true })));

  expect(timedOut).toEqual({ outcome: "timed-out" });
  expect(closed).toEqual({ outcome: "page-closed" });
});
