import path from "node:path";

import { expect, test } from "vitest";

import {
  desktopProductRelativePaths,
  resolveDesktopProductLayout,
} from "@job-boardwalk/desktop-product-layout";

test("defines and resolves the directory-contained desktop product paths", () => {
  expect(desktopProductRelativePaths).toEqual({
    browserProfileDirectory: path.join("data", "browser-profile"),
    browserSessionModule: path.join("payload", "browser-session.cjs"),
    dashboardDirectory: path.join("payload", "dashboard"),
    logDirectory: path.join("data", "logs"),
    migrationsDirectory: path.join("payload", "migrations"),
    workspaceDatabase: path.join("data", "workspace.sqlite"),
    workspaceServiceModule: path.join("payload", "workspace-service.mjs"),
  });

  const root = path.join(path.parse(process.cwd()).root, "Synthetic Job Boardwalk");
  const executable = path.join(root, "bin", "job-boardwalk-desktop-runtime");
  expect(resolveDesktopProductLayout(executable)).toEqual({
    browserProfileDirectory: path.join(root, "data", "browser-profile"),
    browserSessionModule: path.join(root, "payload", "browser-session.cjs"),
    dashboardDirectory: path.join(root, "payload", "dashboard"),
    logDirectory: path.join(root, "data", "logs"),
    migrationsDirectory: path.join(root, "payload", "migrations"),
    productRoot: root,
    runtimeExecutable: executable,
    workspaceDatabasePath: path.join(root, "data", "workspace.sqlite"),
    workspaceServiceModule: path.join(root, "payload", "workspace-service.mjs"),
  });
});
