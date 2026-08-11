import { arch as readArchitecture, platform as readPlatform } from "node:os";
import path from "node:path";

export const productDirectoryName = "job-boardwalk";

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

function installedManagerExecutableName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "job-boardwalk.exe" : "job-boardwalk";
}

function builtManagerExecutableName(platform: NodeJS.Platform): string {
  return platform === "win32"
    ? "job-boardwalk-desktop-manager.exe"
    : "job-boardwalk-desktop-manager";
}

function nodeServiceHostExecutableName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "node-service-host.exe" : "node-service-host";
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
  const builtManagerExecutable = builtManagerExecutableName(platform);
  const nodeServiceHostExecutable = nodeServiceHostExecutableName(platform);
  return [
    {
      destination: installedManagerExecutableName(platform),
      source: path.join(repositoryRoot, "target", "release", builtManagerExecutable),
    },
    {
      destination: path.join("runtime", nodeServiceHostExecutable),
      source: path.join(repositoryRoot, "target", "release", nodeServiceHostExecutable),
    },
    {
      destination: path.join("runtime", caddyExecutableDestination),
      source: caddyExecutable,
    },
    {
      destination: path.join("payload", "caddyfile"),
      source: path.join(repositoryRoot, "apps", "dashboard", "Caddyfile"),
    },
    {
      destination: path.join("payload", "browser-session"),
      source: path.join(repositoryRoot, "target", "service-artifacts", "browser-session"),
    },
    {
      destination: path.join("payload", "dashboard"),
      source: path.join(repositoryRoot, "apps", "dashboard", "dist"),
    },
    {
      destination: path.join("payload", "workspace-service"),
      source: path.join(repositoryRoot, "apps", "workspace-service", "dist", "workspace-service"),
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
