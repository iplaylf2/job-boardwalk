import path from "node:path";

import { expect, test } from "vitest";

import { createDesktopAssemblyPlan, productDirectoryName } from "#/assembly-plan.ts";

const projectOwnedPathSegment = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+)?$/u;

test("places complete Node service artifacts without inspecting their contents", () => {
  const repositoryRoot = path.join(path.parse(process.cwd()).root, "synthetic-job-boardwalk");
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
  expect(plan.components).toContainEqual({
    destination: "job-boardwalk",
    source: path.join(repositoryRoot, "target", "release", "job-boardwalk-desktop-manager"),
  });
  expect(plan.components).toContainEqual({
    destination: path.join("runtime", "node-service-host"),
    source: path.join(repositoryRoot, "target", "release", "node-service-host"),
  });
  expect(plan.components).toContainEqual({
    destination: path.join("runtime", "caddy"),
    source: path.join(repositoryRoot, "inputs", "caddy"),
  });
});

test("places the distribution-owned readme at the product root", () => {
  const repositoryRoot = path.join(path.parse(process.cwd()).root, "synthetic-job-boardwalk");
  const plan = createDesktopAssemblyPlan({
    caddyExecutable: path.join(repositoryRoot, "inputs", "caddy"),
    platform: "linux",
    productVersion: "7.8.9",
    repositoryRoot,
  });

  expect(plan.components).toContainEqual({
    destination: "readme.md",
    source: path.join(repositoryRoot, "internal", "desktop-distribution", "assets", "readme.md"),
  });
});

test("exposes the Windows GUI at the product root and keeps executables under runtime", () => {
  const repositoryRoot = path.join(path.parse(process.cwd()).root, "synthetic-job-boardwalk");
  const plan = createDesktopAssemblyPlan({
    architecture: "x64",
    caddyExecutable: path.join(repositoryRoot, "inputs", "caddy.exe"),
    outputRoot: path.join(repositoryRoot, "output"),
    platform: "win32",
    productVersion: "7.8.9",
    repositoryRoot,
  });

  expect(plan.components).toContainEqual({
    destination: "job-boardwalk.exe",
    source: path.join(repositoryRoot, "target", "release", "job-boardwalk-desktop-manager.exe"),
  });
  expect(plan.components).toContainEqual({
    destination: path.join("runtime", "node-service-host.exe"),
    source: path.join(repositoryRoot, "target", "release", "node-service-host.exe"),
  });
  expect(plan.components).toContainEqual({
    destination: path.join("runtime", "caddy.exe"),
    source: path.join(repositoryRoot, "inputs", "caddy.exe"),
  });
  expect(plan.components).toContainEqual({
    destination: path.join("payload", "caddyfile"),
    source: path.join(repositoryRoot, "apps", "dashboard", "Caddyfile"),
  });
});

test("uses lowercase kebab-case for distribution-owned paths", () => {
  const repositoryRoot = path.join(path.parse(process.cwd()).root, "synthetic-job-boardwalk");
  const plan = createDesktopAssemblyPlan({
    caddyExecutable: path.join(repositoryRoot, "inputs", "caddy.exe"),
    platform: "win32",
    productVersion: "7.8.9",
    repositoryRoot,
  });
  const ownedPaths = [
    productDirectoryName,
    ...plan.components.flatMap((component) => component.destination.split(path.sep)),
  ];

  expect(ownedPaths.every((segment) => projectOwnedPathSegment.test(segment))).toBe(true);
});
