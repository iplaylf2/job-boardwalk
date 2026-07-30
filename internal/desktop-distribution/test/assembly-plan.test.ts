import path from "node:path";

import { expect, test } from "vitest";

import { createDesktopAssemblyPlan } from "#/assembly-plan.ts";

test("places complete Node service artifacts without inspecting their contents", () => {
  const repositoryRoot = path.join(path.parse(process.cwd()).root, "Synthetic Job Boardwalk");
  const plan = createDesktopAssemblyPlan({
    architecture: "synthetic-arch",
    caddyExecutable: path.join(repositoryRoot, "inputs", "caddy"),
    outputRoot: path.join(repositoryRoot, "output"),
    platform: "linux",
    productVersion: "7.8.9",
    repositoryRoot,
  });

  expect(plan.components).toContainEqual({
    destination: path.join("payload", "browser-session"),
    source: path.join(repositoryRoot, "target", "service-artifacts", "browser-session"),
  });
  expect(plan.components).toContainEqual({
    destination: path.join("payload", "workspace-service"),
    source: path.join(repositoryRoot, "apps", "workspace-service", "dist", "workspace-service"),
  });
});
