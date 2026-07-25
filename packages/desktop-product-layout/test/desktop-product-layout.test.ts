import path from "node:path";

import { expect, test } from "vitest";

import {
  desktopProductRelativePaths,
  resolveDesktopProductLayout,
} from "@job-boardwalk/desktop-product-layout";

test("defines and resolves the directory-contained desktop product paths", () => {
  expect(desktopProductRelativePaths).toEqual({
    dashboardDirectory: path.join("payload", "dashboard"),
    migrationsDirectory: path.join("payload", "migrations"),
    workspaceDatabase: path.join("data", "workspace.sqlite"),
    workspaceServiceModule: path.join("payload", "workspace-service.mjs"),
  });

  const root = path.join(path.parse(process.cwd()).root, "Synthetic Job Boardwalk");
  const executable = path.join(root, "bin", "job-boardwalk-runtime");
  expect(resolveDesktopProductLayout(executable)).toEqual({
    dashboardDirectory: path.join(root, "payload", "dashboard"),
    migrationsDirectory: path.join(root, "payload", "migrations"),
    productRoot: root,
    runtimeExecutable: executable,
    workspaceDatabasePath: path.join(root, "data", "workspace.sqlite"),
    workspaceServiceModule: path.join(root, "payload", "workspace-service.mjs"),
  });
});
