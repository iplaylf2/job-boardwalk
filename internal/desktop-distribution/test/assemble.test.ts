import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, onTestFinished, test } from "vitest";

import { assembleDesktopProduct } from "#/assemble.ts";
import type { DesktopAssemblyPlan } from "#/assembly-plan.ts";

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
  components: DesktopAssemblyPlan["components"],
): DesktopAssemblyPlan {
  return {
    architecture: "synthetic-arch",
    components,
    outputRoot: path.join(root, "output"),
    platform: "linux",
    productVersion,
  };
}

describe("assembleDesktopProduct", () => {
  test("assembles only declared artifacts with a deterministic integrity manifest", async () => {
    const root = await createTestRoot();
    const manager = await writeArtifact(root, "sources/manager", "synthetic manager");
    const service = await writeArtifact(root, "sources/service/index.js", "synthetic service");
    const hiddenMetadata = await writeArtifact(
      root,
      "sources/service/.runtime/metadata.json",
      "synthetic metadata",
    );
    const plan = createPlan(root, [
      { destination: "bin/manager", source: manager },
      {
        destination: "payload/service/index.js",
        source: service,
      },
      {
        destination: "payload/service/.runtime/metadata.json",
        source: hiddenMetadata,
      },
    ]);

    const first = await assembleDesktopProduct(plan);
    const firstManifest = await readFile(
      path.join(first.productDirectory, "manifest.json"),
      "utf8",
    );
    await writeArtifact(first.productDirectory, "stale.txt", "stale");
    const second = await assembleDesktopProduct(plan);
    const secondManifest = await readFile(
      path.join(second.productDirectory, "manifest.json"),
      "utf8",
    );

    expect(secondManifest).toBe(firstManifest);
    expect(second.manifest.files.map((file) => file.path)).toEqual([
      "bin/manager",
      "payload/service/.runtime/metadata.json",
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

    await expect(assembleDesktopProduct(plan)).rejects.toThrow();
  });

  test.skipIf(process.platform === "win32")(
    "materializes artifact symlinks in the installed product tree",
    async () => {
      const root = await createTestRoot();
      const executable = await writeArtifact(
        root,
        "sources/service/node_modules/tool/cli.js",
        "synthetic executable",
      );
      const executableLink = path.join(root, "sources/service/node_modules/.bin/synthetic-tool");
      await mkdir(path.dirname(executableLink), { recursive: true });
      await symlink(path.relative(path.dirname(executableLink), executable), executableLink);
      const plan = createPlan(root, [
        {
          destination: "payload/service",
          source: path.join(root, "sources/service"),
        },
      ]);

      const result = await assembleDesktopProduct(plan);
      const installedLink = path.join(
        result.productDirectory,
        "payload/service/node_modules/.bin/synthetic-tool",
      );

      const installedLinkMetadata = await stat(installedLink);
      expect(installedLinkMetadata.isFile()).toBe(true);
      expect(await readFile(installedLink, "utf8")).toBe("synthetic executable");
      expect(result.manifest.files.map((file) => file.path)).toContain(
        "payload/service/node_modules/.bin/synthetic-tool",
      );
    },
  );
});
