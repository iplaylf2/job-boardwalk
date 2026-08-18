import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { arch, platform, tmpdir } from "node:os";
import path from "node:path";

import { expect, onTestFinished, test } from "vitest";

import { assembleDesktopProduct } from "#/assemble.ts";
import type { DesktopAssemblyPlan } from "#/assembly-plan.ts";
import { createPortableArchive } from "#/package.ts";

const nextArgumentOffset = 1;

async function createTestRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "job-boardwalk-package-test-"));
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

async function assembleSyntheticNativeProduct(root: string): Promise<string> {
  const managerName =
    platform() === "win32" ? "job-boardwalk-desktop-manager.exe" : "job-boardwalk-desktop-manager";
  const installedManagerName = platform() === "win32" ? "job-boardwalk.exe" : "job-boardwalk";
  const manager = await writeArtifact(root, `sources/${managerName}`, "synthetic manager");
  const payload = await writeArtifact(root, "sources/payload.txt", "synthetic payload");
  const plan: DesktopAssemblyPlan = {
    components: [
      { destination: installedManagerName, source: manager },
      { destination: "payload/synthetic.txt", source: payload },
    ],
    outputRoot: path.join(root, "assembled"),
  };
  const result = await assembleDesktopProduct(plan);
  return result.productDirectory;
}

test("creates the native platform archive", async () => {
  const root = await createTestRoot();
  const productDirectory = await assembleSyntheticNativeProduct(root);
  const nativePlatform = platform();
  const archivePath = await createPortableArchive(
    {
      outputDirectory: path.join(root, "releases"),
      productDirectory,
      productVersion: "7.8.9",
    },
    async (executable, arguments_, environment) => {
      let destinationPath: string | null = null;
      if (nativePlatform === "linux") {
        expect(executable).toBe("tar");
        destinationPath = arguments_[arguments_.indexOf("--file") + nextArgumentOffset] ?? null;
      } else if (nativePlatform === "win32") {
        expect(executable).toBe("powershell.exe");
        destinationPath = environment?.["JOB_BOARDWALK_ARCHIVE_PATH"] ?? null;
      }
      if (!destinationPath) {
        throw new Error("Synthetic packager did not receive an archive path.");
      }
      await writeFile(destinationPath, "synthetic portable archive");
    },
  );

  const platformName = nativePlatform === "win32" ? "windows" : nativePlatform;
  const extension = nativePlatform === "win32" ? ".zip" : ".tar.gz";
  expect(path.basename(archivePath)).toBe(
    `job-boardwalk-7.8.9-${platformName}-${arch()}${extension}`,
  );
  expect(await readFile(archivePath, "utf8")).toBe("synthetic portable archive");
});
