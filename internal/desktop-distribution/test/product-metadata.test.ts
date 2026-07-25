import { describe, expect, test } from "vitest";

import { parseDesktopManagerVersion } from "#/product-metadata.ts";

describe("parseDesktopManagerVersion", () => {
  test("reads the desktop manager package version from Cargo metadata", () => {
    const metadata = JSON.stringify({
      packages: [
        { name: "synthetic-unrelated-package", version: "9.9.9" },
        { name: "job-boardwalk-desktop-manager", version: "1.2.3" },
      ],
    });

    expect(parseDesktopManagerVersion(metadata)).toBe("1.2.3");
  });

  test("rejects metadata without the desktop manager package", () => {
    const metadata = JSON.stringify({
      packages: [{ name: "synthetic-unrelated-package", version: "9.9.9" }],
    });

    expect(() => parseDesktopManagerVersion(metadata)).toThrow(
      /does not contain job-boardwalk-desktop-manager/u,
    );
  });
});
