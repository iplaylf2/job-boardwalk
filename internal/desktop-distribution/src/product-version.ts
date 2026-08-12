import { readFile } from "node:fs/promises";

interface PackageManifest {
  readonly version?: unknown;
}

export function parseProductVersionFromPackageManifest(packageManifestJson: string): string {
  const manifest = JSON.parse(packageManifestJson) as PackageManifest;
  if (typeof manifest.version !== "string" || !manifest.version) {
    throw new Error("Desktop Distribution package manifest does not contain a product version.");
  }
  return manifest.version;
}

export async function readProductVersion(): Promise<string> {
  return parseProductVersionFromPackageManifest(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
}
