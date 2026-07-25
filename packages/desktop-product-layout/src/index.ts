import path from "node:path";

export const desktopProductRelativePaths = {
  dashboardDirectory: path.join("payload", "dashboard"),
  migrationsDirectory: path.join("payload", "migrations"),
  workspaceDatabase: path.join("data", "workspace.sqlite"),
  workspaceServiceModule: path.join("payload", "workspace-service.mjs"),
} as const;

export interface DesktopProductLayout {
  readonly dashboardDirectory: string;
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
    dashboardDirectory: path.resolve(productRoot, desktopProductRelativePaths.dashboardDirectory),
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
