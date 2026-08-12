import { describe, expect, test } from "vitest";

import { parseProductVersionFromPackageManifest } from "#/product-version.ts";

describe("parseProductVersionFromPackageManifest", () => {
  test("extracts the product version from the distribution package manifest", () => {
    expect(
      parseProductVersionFromPackageManifest(
        JSON.stringify({ name: "@synthetic-example/desktop-distribution", version: "1.2.3" }),
      ),
    ).toBe("1.2.3");
  });

  test.each([{}, { version: "" }, { version: 123 }])(
    "rejects a manifest without a non-empty string version: %j",
    (manifest) => {
      expect(() => parseProductVersionFromPackageManifest(JSON.stringify(manifest))).toThrow();
    },
  );
});
