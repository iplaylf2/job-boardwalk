import { arch as readArchitecture, platform as readPlatform } from "node:os";
import path from "node:path";

import { desktopProductRelativePaths } from "@job-boardwalk/desktop-product-layout";

export interface DistributionComponent {
  readonly destination: string;
  readonly source: string;
}

export interface DesktopDistributionPlan {
  readonly architecture: string;
  readonly components: readonly DistributionComponent[];
  readonly outputRoot: string;
  readonly platform: NodeJS.Platform;
  readonly productVersion: string;
}

interface CreateDesktopDistributionPlanOptions {
  readonly architecture?: string;
  readonly outputRoot?: string;
  readonly platform?: NodeJS.Platform;
  readonly productVersion: string;
  readonly repositoryRoot: string;
}

function managerExecutableName(platform: NodeJS.Platform): string {
  return platform === "win32"
    ? "job-boardwalk-desktop-manager.exe"
    : "job-boardwalk-desktop-manager";
}

function runtimeExecutableName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "job-boardwalk-runtime.exe" : "job-boardwalk-runtime";
}

function createDistributionComponents(
  repositoryRoot: string,
  platform: NodeJS.Platform,
): DistributionComponent[] {
  const managerExecutable = managerExecutableName(platform);
  const runtimeExecutable = runtimeExecutableName(platform);
  return [
    {
      destination: path.join("bin", managerExecutable),
      source: path.join(repositoryRoot, "target", "release", managerExecutable),
    },
    {
      destination: path.join("bin", runtimeExecutable),
      source: path.join(repositoryRoot, "target", "release", runtimeExecutable),
    },
    {
      destination: desktopProductRelativePaths.dashboardDirectory,
      source: path.join(repositoryRoot, "apps", "dashboard", "dist"),
    },
    {
      destination: desktopProductRelativePaths.workspaceServiceModule,
      source: path.join(
        repositoryRoot,
        "apps",
        "workspace-service",
        "dist",
        "workspace-service.mjs",
      ),
    },
    {
      destination: desktopProductRelativePaths.migrationsDirectory,
      source: path.join(repositoryRoot, "apps", "workspace-service", "dist", "migrations"),
    },
  ];
}

export function createDesktopDistributionPlan(
  options: CreateDesktopDistributionPlanOptions,
): DesktopDistributionPlan {
  const architecture = options.architecture ?? readArchitecture();
  const platform = options.platform ?? readPlatform();

  return {
    architecture,
    components: createDistributionComponents(options.repositoryRoot, platform),
    outputRoot:
      options.outputRoot ??
      path.join(
        options.repositoryRoot,
        "target",
        "desktop-distribution",
        `${platform}-${architecture}`,
      ),
    platform,
    productVersion: options.productVersion,
  };
}
