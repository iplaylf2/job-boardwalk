import path from "node:path";
import { expect, test } from "vitest";

import { resolveBrowserProfilePath } from "#/browser/profile-path.js";

test("uses the Browser Session path override without a shared state root", () => {
  expect(
    resolveBrowserProfilePath(
      { JOB_BOARDWALK_BROWSER_PROFILE_PATH: "/srv/browser-profile" },
      "linux",
      "/home/tester",
    ),
  ).toBe(path.resolve("/srv/browser-profile"));
});

test("uses the platform user data directory by default", () => {
  expect(resolveBrowserProfilePath({}, "linux", "/home/tester")).toBe(
    "/home/tester/.local/share/job-boardwalk/browser-session/profile",
  );
  expect(resolveBrowserProfilePath({ XDG_DATA_HOME: "/data" }, "linux", "/home/tester")).toBe(
    "/data/job-boardwalk/browser-session/profile",
  );
});
