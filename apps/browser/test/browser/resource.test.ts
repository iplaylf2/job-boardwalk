import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

import { run } from "@shajara/host";
import { browserSession, hasBrowserProcessExited } from "#/browser/session.js";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { spawnBrowser } = vi.hoisted(() => ({ spawnBrowser: vi.fn() }));

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  spawn: spawnBrowser,
}));

vi.mock("#/browser/command.js", () => ({
  resolveChromiumCommand: () => "/fake/chromium",
}));

interface FakeBrowserProcess extends ChildProcess {
  killedWith: NodeJS.Signals[];
}

const fakeProcessId = 123;

function createBrowserProcess(): FakeBrowserProcess {
  // oxlint-disable-next-line unicorn/prefer-event-target -- ChildProcess uses EventEmitter.
  const browserProcess = new EventEmitter() as FakeBrowserProcess;
  let signalCode: NodeJS.Signals | null = null;
  let exitScheduled = false;
  Object.defineProperties(browserProcess, {
    exitCode: { get: () => null },
    pid: { get: () => fakeProcessId },
    signalCode: { get: () => signalCode },
  });
  browserProcess.killedWith = [];
  browserProcess.kill = vi.fn((signal: NodeJS.Signals = "SIGTERM") => {
    browserProcess.killedWith.push(signal);
    if (!exitScheduled) {
      exitScheduled = true;
      queueMicrotask(() => {
        signalCode = signal;
        browserProcess.emit("exit", null, signal);
      });
    }
    return true;
  });
  return browserProcess;
}

describe("browser resource ownership", () => {
  beforeEach(() => {
    spawnBrowser.mockReset();
  });

  test("releases the browser before its owning scope returns", async () => {
    const browserProcess = createBrowserProcess();
    spawnBrowser.mockImplementation(() => {
      queueMicrotask(() => browserProcess.emit("spawn"));
      return browserProcess;
    });

    await run(function* useBrowser() {
      const session = yield* browserSession("/profile", "https://example.com", "none");
      expect(session.browserProcess).toBe(browserProcess);
      expect(hasBrowserProcessExited(browserProcess)).toBe(false);
    });

    expect(hasBrowserProcessExited(browserProcess)).toBe(true);
  });

  test("terminates a browser canceled before it becomes ready", async () => {
    const browserProcess = createBrowserProcess();
    spawnBrowser.mockReturnValue(browserProcess);
    const cancellation = new AbortController();

    const launched = run(
      function* acquireBrowser() {
        yield* browserSession("/profile", "https://example.com", "none");
      },
      { signal: cancellation.signal },
    );
    await vi.waitFor(() => expect(spawnBrowser).toHaveBeenCalledOnce());
    cancellation.abort();

    await expect(launched).rejects.toBeDefined();
    expect(hasBrowserProcessExited(browserProcess)).toBe(true);
  });
});
