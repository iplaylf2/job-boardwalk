import { arch as readArchitecture, platform as readPlatform } from "node:os";
import path from "node:path";

import { desktopProductRelativePaths } from "@job-boardwalk/desktop-product-layout";

export interface AssemblyComponent {
  readonly destination: string;
  readonly source: string;
}

export interface DesktopAssemblyPlan {
  readonly architecture: string;
  readonly components: readonly AssemblyComponent[];
  readonly outputRoot: string;
  readonly platform: NodeJS.Platform;
  readonly productVersion: string;
}

interface CreateDesktopAssemblyPlanOptions {
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

function desktopRuntimeExecutableName(platform: NodeJS.Platform): string {
  return platform === "win32"
    ? "job-boardwalk-desktop-runtime.exe"
    : "job-boardwalk-desktop-runtime";
}

function createAssemblyComponents(
  repositoryRoot: string,
  platform: NodeJS.Platform,
): AssemblyComponent[] {
  const managerExecutable = managerExecutableName(platform);
  const desktopRuntimeExecutable = desktopRuntimeExecutableName(platform);
  return [
    {
      destination: path.join("bin", managerExecutable),
      source: path.join(repositoryRoot, "target", "release", managerExecutable),
    },
    {
      destination: path.join("bin", desktopRuntimeExecutable),
      source: path.join(repositoryRoot, "target", "release", desktopRuntimeExecutable),
    },
    {
      destination: desktopProductRelativePaths.browserSessionModule,
      source: path.join(repositoryRoot, "apps", "browser-session", "dist", "browser-session.cjs"),
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

export function createDesktopAssemblyPlan(
  options: CreateDesktopAssemblyPlanOptions,
): DesktopAssemblyPlan {
  const architecture = options.architecture ?? readArchitecture();
  const platform = options.platform ?? readPlatform();

  return {
    architecture,
    components: createAssemblyComponents(options.repositoryRoot, platform),
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
