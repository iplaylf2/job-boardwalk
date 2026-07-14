import type { Browser } from "patchright";
import { expect, test } from "vitest";

import { BrowserToolRuntime } from "#/browser/tool-runtime.js";

const outOfRangeWaitMilliseconds = 10_001;

function browserWithoutPages(): Browser {
  return { contexts: () => [] } as unknown as Browser;
}

test("rejects an out-of-range wait instead of silently changing it", () => {
  const runtime = new BrowserToolRuntime(browserWithoutPages());

  expect(() =>
    runtime.execute("browser_wait", { milliseconds: outOfRangeWaitMilliseconds }).next(),
  ).toThrow(/milliseconds/u);
});
