import { chromium } from "patchright";
import type { BrowserContext } from "patchright";
import { expect, test, vi } from "vitest";

import { launchPersistentContext } from "#/browser/persistent-context-launch.js";

test.each([
  { expected: {}, options: {} },
  { expected: { channel: "msedge" }, options: { channel: "msedge" as const } },
  {
    expected: { executablePath: "/synthetic/browser" },
    options: { executablePath: "/synthetic/browser" },
  },
  {
    expected: { args: ["--use-gl=angle", "--use-angle=swiftshader"] },
    options: { graphicsBackend: "swiftshader" as const },
  },
])(
  "launches a visible sandboxed browser with the selected configuration: $options",
  async ({ expected, options }) => {
    const context = {} as BrowserContext;
    const launch = vi.spyOn(chromium, "launchPersistentContext").mockResolvedValue(context);
    try {
      await expect(launchPersistentContext("/synthetic/profile", options)).resolves.toBe(context);
      expect(launch).toHaveBeenCalledExactlyOnceWith("/synthetic/profile", {
        ...expected,
        chromiumSandbox: true,
        headless: false,
        viewport: null,
      });
    } finally {
      launch.mockRestore();
    }
  },
);
