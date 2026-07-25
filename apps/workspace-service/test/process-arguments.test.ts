import path from "node:path";

import { expect, test } from "vitest";

import { parseWorkspaceServiceArguments } from "#/runtime/process-arguments.js";

test("accepts a complete set of installed runtime paths and listener arguments", () => {
  const root = path.join(path.parse(process.cwd()).root, "Synthetic Job Boardwalk");

  expect(
    parseWorkspaceServiceArguments([
      `--workspace-database-path=${path.join(root, "data", "workspace.sqlite")}`,
      `--migrations-directory=${path.join(root, "payload", "migrations")}`,
      "--hostname=127.0.0.1",
      "--port=54310",
    ]),
  ).toEqual({
    databasePath: path.join(root, "data", "workspace.sqlite"),
    httpServerAddress: {
      hostname: "127.0.0.1",
      port: 54_310,
    },
    migrationsDirectory: path.join(root, "payload", "migrations"),
  });
});

test("rejects relative installed paths and partial listener configuration", () => {
  expect(() =>
    parseWorkspaceServiceArguments(["--workspace-database-path=data/workspace.sqlite"]),
  ).toThrow(/absolute path/u);
  expect(() => parseWorkspaceServiceArguments(["--hostname=127.0.0.1"])).toThrow(
    /provided together/u,
  );
});
