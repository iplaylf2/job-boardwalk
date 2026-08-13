import path from "node:path";

import { expect, test } from "vitest";

import { parseBrowserSessionArguments } from "#/process-arguments.js";

test("accepts explicit distribution-owned Browser Session process arguments", () => {
  const root = path.join(path.parse(process.cwd()).root, "Synthetic Job Boardwalk");

  expect(
    parseBrowserSessionArguments([
      `--browser-executable-path=${path.join(root, "browser", "chrome")}`,
      `--browser-profile-path=${path.join(root, "data", "browser-profile")}`,
      "--hostname=127.0.0.1",
      "--port=54312",
      "--workspace-service-url=http://127.0.0.1:54310",
    ]),
  ).toEqual({
    browserExecutablePath: path.join(root, "browser", "chrome"),
    httpServerAddress: { hostname: "127.0.0.1", port: 54_312 },
    profilePath: path.join(root, "data", "browser-profile"),
    workspaceServiceUrl: new URL("http://127.0.0.1:54310"),
  });
});

test("rejects relative paths, partial listener addresses, and unsupported upstream URLs", () => {
  expect(() =>
    parseBrowserSessionArguments(["--browser-profile-path=data/browser-profile"]),
  ).toThrow(/absolute path/u);
  expect(() => parseBrowserSessionArguments(["--hostname=127.0.0.1"])).toThrow(
    /provided together/u,
  );
  expect(() =>
    parseBrowserSessionArguments(["--workspace-service-url=file:///tmp/workspace"]),
  ).toThrow(/credentialless HTTP/u);
});
