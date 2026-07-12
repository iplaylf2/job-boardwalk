import { spawn } from "node:child_process";
import { once } from "node:events";
import process from "node:process";

import { run } from "@shajara/host";
import { hasBrowserProcessExited, stopBrowserSession } from "#/browser/session.js";
import { describe, expect, test } from "vitest";

describe("browser session lifecycle", () => {
  test("treats signal termination as exited and cleanup as idempotent", async () => {
    const browserProcess = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
    await once(browserProcess, "spawn");
    const session = { browserProcess, profilePath: "/unused" };

    await run(() => stopBrowserSession(session));

    expect(hasBrowserProcessExited(browserProcess)).toBe(true);
    await expect(run(() => stopBrowserSession(session))).resolves.toBeUndefined();
  });
});
