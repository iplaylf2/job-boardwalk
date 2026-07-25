import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, onTestFinished, test } from "vitest";

import { assembleDesktopDistribution } from "#/assemble.ts";
import type { DesktopDistributionPlan } from "#/distribution-layout.ts";

const productVersion = "7.8.9";

async function createTestRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "job-boardwalk-distribution-test-"));
  onTestFinished(() => rm(root, { force: true, recursive: true }));
  return root;
}

async function writeArtifact(
  root: string,
  relativePath: string,
  contents: string,
): Promise<string> {
  const artifactPath = path.join(root, relativePath);
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, contents);
  return artifactPath;
}

function createPlan(
  root: string,
  components: DesktopDistributionPlan["components"],
): DesktopDistributionPlan {
  return {
    architecture: "synthetic-arch",
    components,
    outputRoot: path.join(root, "output"),
    platform: "linux",
    productVersion,
  };
}

describe("assembleDesktopDistribution", () => {
  test("assembles only declared artifacts with a deterministic integrity manifest", async () => {
    const root = await createTestRoot();
    const manager = await writeArtifact(root, "sources/manager", "synthetic manager");
    const service = await writeArtifact(root, "sources/service/index.js", "synthetic service");
    const plan = createPlan(root, [
      { destination: "bin/manager", source: manager },
      {
        destination: "payload/service/index.js",
        source: service,
      },
    ]);

    const first = await assembleDesktopDistribution(plan);
    const firstManifest = await readFile(
      path.join(first.productDirectory, "manifest.json"),
      "utf8",
    );
    await writeArtifact(first.productDirectory, "stale.txt", "stale");
    const second = await assembleDesktopDistribution(plan);
    const secondManifest = await readFile(
      path.join(second.productDirectory, "manifest.json"),
      "utf8",
    );

    expect(secondManifest).toBe(firstManifest);
    expect(second.manifest.files.map((file) => file.path)).toEqual([
      "bin/manager",
      "payload/service/index.js",
    ]);
    const dataDirectory = await stat(path.join(second.productDirectory, "data"));
    expect(dataDirectory.isDirectory()).toBe(true);
    await expect(readFile(path.join(second.productDirectory, "stale.txt"))).rejects.toThrow();
  });

  test("rejects a component destination outside the product directory", async () => {
    const root = await createTestRoot();
    const source = await writeArtifact(root, "sources/manager", "synthetic manager");
    const plan = createPlan(root, [{ destination: "../outside", source }]);

    await expect(assembleDesktopDistribution(plan)).rejects.toThrow(
      /destination escapes the product directory/u,
    );
  });
});
