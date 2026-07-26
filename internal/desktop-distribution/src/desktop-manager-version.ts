import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const desktopManagerPackageName = "job-boardwalk-desktop-manager";
const executeFile = promisify(execFile);

interface CargoPackage {
  readonly name: string;
  readonly version: string;
}

interface CargoMetadata {
  readonly packages: readonly CargoPackage[];
}

export function parseDesktopManagerVersion(metadataJson: string): string {
  const metadata = JSON.parse(metadataJson) as CargoMetadata;
  const desktopManager = metadata.packages.find(
    (candidate) => candidate.name === desktopManagerPackageName,
  );
  if (!desktopManager) {
    throw new Error(`cargo metadata does not contain ${desktopManagerPackageName}`);
  }

  return desktopManager.version;
}

export async function readDesktopManagerVersion(repositoryRoot: string): Promise<string> {
  const manifestPath = path.join(repositoryRoot, "Cargo.toml");
  const { stdout } = await executeFile("cargo", [
    "metadata",
    "--format-version",
    "1",
    "--no-deps",
    "--manifest-path",
    manifestPath,
  ]);

  return parseDesktopManagerVersion(stdout);
}
