import type { Page } from "patchright";
import { run } from "@shajara/host";
import { expect, test } from "vitest";

import { capturePageDiagnostics } from "#/browser/page-diagnostics.js";

test("requests viewport capture with editable-field masks only when requested", async () => {
  const screenshots: unknown[] = [];
  const fields = { synthetic: "editable fields" };
  const page = {
    locator: (selector: string) => {
      if (selector === "html") {
        return { evaluate: () => Promise.resolve({ language: "en-US" }) };
      }
      expect(selector).toBe("input, textarea, [contenteditable]");
      return fields;
    },
    screenshot: (options: unknown) => {
      screenshots.push(options);
      return Promise.resolve(Buffer.from("synthetic-png"));
    },
  } as unknown as Page;
  expect(await run(() => capturePageDiagnostics(page, false))).toEqual({
    environment: { language: "en-US" },
  });
  expect(screenshots).toEqual([]);
  expect(await run(() => capturePageDiagnostics(page, true))).toMatchObject({
    screenshot: { data: Buffer.from("synthetic-png").toString("base64"), mimeType: "image/png" },
  });
  expect(screenshots).toEqual([
    expect.objectContaining({ fullPage: false, mask: [fields], type: "png" }),
  ]);
});
