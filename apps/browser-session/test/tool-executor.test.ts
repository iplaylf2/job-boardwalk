import type { BrowserContext } from "patchright";
import { expect, test } from "vitest";

import { BrowserToolExecutor } from "#/browser/tool-executor.js";

const outOfRangeWaitMilliseconds = 10_001;

function browserWithoutPages(): BrowserContext {
  const context = { on: () => context, pages: () => [] } as unknown as BrowserContext;
  return context;
}

test("rejects an out-of-range wait instead of silently changing it", () => {
  const executor = new BrowserToolExecutor(browserWithoutPages());

  expect(() =>
    executor.execute("browser_wait", { milliseconds: outOfRangeWaitMilliseconds }).next(),
  ).toThrow(/milliseconds/u);
});
