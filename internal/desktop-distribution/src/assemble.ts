import { createHash } from "node:crypto";
import { cp, glob, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DesktopDistributionPlan, DistributionComponent } from "#/distribution-layout.ts";

const manifestFormatVersion = 1;
const manifestIndentationSpaces = 2;
const productDirectoryName = "Job Boardwalk";

interface ManifestFile {
  readonly path: string;
  readonly sha256: string;
  readonly size: number;
}

interface DistributionManifest {
  readonly architecture: string;
  readonly artifactKind: "desktop-staging";
  readonly files: readonly ManifestFile[];
  readonly formatVersion: number;
  readonly platform: NodeJS.Platform;
  readonly productVersion: string;
  readonly releaseReady: false;
}

export interface AssemblyResult {
  readonly manifest: DistributionManifest;
  readonly productDirectory: string;
}

function validateDestination(destination: string): void {
  const normalized = path.normalize(destination);
  if (
    path.isAbsolute(destination) ||
    normalized === ".." ||
    normalized.startsWith(`..${path.sep}`)
  ) {
    throw new Error(`Component destination escapes the product directory: ${destination}`);
  }
}

async function copyComponent(
  stagingDirectory: string,
  component: DistributionComponent,
): Promise<void> {
  validateDestination(component.destination);
  const destination = path.join(stagingDirectory, component.destination);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(component.source, destination, { recursive: true });
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await Array.fromAsync(glob("**/*", { cwd: root, withFileTypes: true }));
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
    .toSorted();
}

async function describeFile(root: string, relativePath: string): Promise<ManifestFile> {
  const contents = await readFile(path.join(root, relativePath));
  return {
    path: relativePath.split(path.sep).join("/"),
    sha256: createHash("sha256").update(contents).digest("hex"),
    size: contents.byteLength,
  };
}

async function createManifest(
  stagingDirectory: string,
  plan: DesktopDistributionPlan,
): Promise<DistributionManifest> {
  const relativePaths = await listFiles(stagingDirectory);
  const files = await Promise.all(
    relativePaths.map((relativePath) => describeFile(stagingDirectory, relativePath)),
  );

  return {
    architecture: plan.architecture,
    artifactKind: "desktop-staging",
    files,
    formatVersion: manifestFormatVersion,
    platform: plan.platform,
    productVersion: plan.productVersion,
    releaseReady: false,
  };
}

export async function assembleDesktopDistribution(
  plan: DesktopDistributionPlan,
): Promise<AssemblyResult> {
  await mkdir(plan.outputRoot, { recursive: true });
  const temporaryDirectory = await mkdtemp(path.join(plan.outputRoot, ".assemble-"));
  const stagingDirectory = path.join(temporaryDirectory, productDirectoryName);
  const productDirectory = path.join(plan.outputRoot, productDirectoryName);

  try {
    await mkdir(path.join(stagingDirectory, "data"), { recursive: true });
    await Promise.all(
      plan.components.map((component) => copyComponent(stagingDirectory, component)),
    );
    const manifest = await createManifest(stagingDirectory, plan);
    await writeFile(
      path.join(stagingDirectory, "manifest.json"),
      `${JSON.stringify(manifest, null, manifestIndentationSpaces)}\n`,
    );
    await rm(productDirectory, { force: true, recursive: true });
    await rename(stagingDirectory, productDirectory);
    return { manifest, productDirectory };
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}
