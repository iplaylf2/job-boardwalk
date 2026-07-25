import { arch as readArchitecture, platform as readPlatform } from "node:os";
import path from "node:path";

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

function executableName(platform: NodeJS.Platform): string {
  return platform === "win32"
    ? "job-boardwalk-desktop-manager.exe"
    : "job-boardwalk-desktop-manager";
}

export function createDesktopDistributionPlan(
  options: CreateDesktopDistributionPlanOptions,
): DesktopDistributionPlan {
  const architecture = options.architecture ?? readArchitecture();
  const platform = options.platform ?? readPlatform();
  const managerExecutable = executableName(platform);

  return {
    architecture,
    components: [
      {
        destination: path.join("bin", managerExecutable),
        source: path.join(options.repositoryRoot, "target", "release", managerExecutable),
      },
      {
        destination: path.join("payload", "browser-session"),
        source: path.join(options.repositoryRoot, "apps", "browser-session", "dist"),
      },
      {
        destination: path.join("payload", "dashboard"),
        source: path.join(options.repositoryRoot, "apps", "dashboard", "dist"),
      },
      {
        destination: path.join("payload", "workspace-service"),
        source: path.join(options.repositoryRoot, "apps", "workspace-service", "dist"),
      },
    ],
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
