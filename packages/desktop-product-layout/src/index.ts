import path from "node:path";

export const desktopProductRelativePaths = {
  browserProfileDirectory: path.join("data", "browser-profile"),
  browserSessionModule: path.join("payload", "browser-session.cjs"),
  dashboardDirectory: path.join("payload", "dashboard"),
  logDirectory: path.join("data", "logs"),
  migrationsDirectory: path.join("payload", "migrations"),
  workspaceDatabase: path.join("data", "workspace.sqlite"),
  workspaceServiceModule: path.join("payload", "workspace-service.mjs"),
} as const;

export interface DesktopProductLayout {
  readonly browserProfileDirectory: string;
  readonly browserSessionModule: string;
  readonly dashboardDirectory: string;
  readonly logDirectory: string;
  readonly migrationsDirectory: string;
  readonly productRoot: string;
  readonly runtimeExecutable: string;
  readonly workspaceDatabasePath: string;
  readonly workspaceServiceModule: string;
}

export function resolveDesktopProductLayout(runtimeExecutable: string): DesktopProductLayout {
  const absoluteExecutable = path.resolve(runtimeExecutable);
  const productRoot = path.dirname(path.dirname(absoluteExecutable));

  return {
    browserProfileDirectory: path.resolve(
      productRoot,
      desktopProductRelativePaths.browserProfileDirectory,
    ),
    browserSessionModule: path.resolve(
      productRoot,
      desktopProductRelativePaths.browserSessionModule,
    ),
    dashboardDirectory: path.resolve(productRoot, desktopProductRelativePaths.dashboardDirectory),
    logDirectory: path.resolve(productRoot, desktopProductRelativePaths.logDirectory),
    migrationsDirectory: path.resolve(productRoot, desktopProductRelativePaths.migrationsDirectory),
    productRoot,
    runtimeExecutable: absoluteExecutable,
    workspaceDatabasePath: path.resolve(productRoot, desktopProductRelativePaths.workspaceDatabase),
    workspaceServiceModule: path.resolve(
      productRoot,
      desktopProductRelativePaths.workspaceServiceModule,
    ),
  };
}
