import { arch as readArchitecture, platform as readPlatform } from "node:os";
import path from "node:path";

export const productDirectoryName = "Job Boardwalk";

export function desktopDistributionRoot(repositoryRoot: string): string {
  return path.join(repositoryRoot, "target", "desktop-distribution");
}

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
  readonly caddyExecutable: string;
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

function desktopServiceHostExecutableName(platform: NodeJS.Platform): string {
  return platform === "win32"
    ? "job-boardwalk-desktop-service-host.exe"
    : "job-boardwalk-desktop-service-host";
}

function caddyExecutableName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "caddy.exe" : "caddy";
}

function createAssemblyComponents(
  caddyExecutable: string,
  repositoryRoot: string,
  platform: NodeJS.Platform,
): AssemblyComponent[] {
  const caddyExecutableDestination = caddyExecutableName(platform);
  const managerExecutable = managerExecutableName(platform);
  const desktopServiceHostExecutable = desktopServiceHostExecutableName(platform);
  return [
    {
      destination: path.join("bin", managerExecutable),
      source: path.join(repositoryRoot, "target", "release", managerExecutable),
    },
    {
      destination: path.join("bin", desktopServiceHostExecutable),
      source: path.join(repositoryRoot, "target", "release", desktopServiceHostExecutable),
    },
    {
      destination: path.join("bin", caddyExecutableDestination),
      source: caddyExecutable,
    },
    {
      destination: path.join("payload", "Caddyfile"),
      source: path.join(repositoryRoot, "apps", "dashboard", "Caddyfile"),
    },
    {
      destination: path.join("payload", "browser-session.cjs"),
      source: path.join(repositoryRoot, "apps", "browser-session", "dist", "browser-session.cjs"),
    },
    {
      destination: path.join("payload", "dashboard"),
      source: path.join(repositoryRoot, "apps", "dashboard", "dist"),
    },
    {
      destination: path.join("payload", "workspace-service.mjs"),
      source: path.join(
        repositoryRoot,
        "apps",
        "workspace-service",
        "dist",
        "workspace-service.mjs",
      ),
    },
    {
      destination: path.join("payload", "migrations"),
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
    components: createAssemblyComponents(options.caddyExecutable, options.repositoryRoot, platform),
    outputRoot:
      options.outputRoot ??
      path.join(desktopDistributionRoot(options.repositoryRoot), `${platform}-${architecture}`),
    platform,
    productVersion: options.productVersion,
  };
}
