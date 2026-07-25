import path from "node:path";

import { expect, test } from "vitest";

import { createDesktopDistributionPlan } from "#/distribution-layout.ts";

test("defines the product-owned staging inputs and platform output", () => {
  const repositoryRoot = path.join(path.parse(process.cwd()).root, "synthetic-repository");
  const plan = createDesktopDistributionPlan({
    architecture: "synthetic-arch",
    platform: "win32",
    productVersion: "1.2.3",
    repositoryRoot,
  });

  expect(plan).toEqual({
    architecture: "synthetic-arch",
    components: [
      {
        destination: path.join("bin", "job-boardwalk-desktop-manager.exe"),
        source: path.join(repositoryRoot, "target", "release", "job-boardwalk-desktop-manager.exe"),
      },
      {
        destination: path.join("payload", "browser-session"),
        source: path.join(repositoryRoot, "apps", "browser-session", "dist"),
      },
      {
        destination: path.join("payload", "dashboard"),
        source: path.join(repositoryRoot, "apps", "dashboard", "dist"),
      },
      {
        destination: path.join("payload", "workspace-service"),
        source: path.join(repositoryRoot, "apps", "workspace-service", "dist"),
      },
    ],
    outputRoot: path.join(repositoryRoot, "target", "desktop-distribution", "win32-synthetic-arch"),
    platform: "win32",
    productVersion: "1.2.3",
  });
});
