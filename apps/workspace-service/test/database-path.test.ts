import path from "node:path";
import { expect, test } from "vitest";

import { resolveWorkspaceDatabasePath } from "#/persistence/database-path.js";

test("uses the Workspace Service database override without a shared state root", () => {
  expect(
    resolveWorkspaceDatabasePath(
      { JOB_BOARDWALK_WORKSPACE_DATABASE_PATH: "/srv/workspace.sqlite" },
      "linux",
      "/home/tester",
    ),
  ).toBe(path.resolve("/srv/workspace.sqlite"));
});

test("uses the platform user data directory by default", () => {
  expect(resolveWorkspaceDatabasePath({}, "linux", "/home/tester")).toBe(
    "/home/tester/.local/share/job-boardwalk/workspace-service/workspace.sqlite",
  );
  expect(resolveWorkspaceDatabasePath({ XDG_DATA_HOME: "/data" }, "linux", "/home/tester")).toBe(
    "/data/job-boardwalk/workspace-service/workspace.sqlite",
  );
});
