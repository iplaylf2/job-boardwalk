import { resource, run } from "@shajara/host";
import { cede, wait } from "@shajara/host/primitives";
import { login } from "#/login/workflow.js";
import type { LoginProgressEvent } from "#/login/progress.js";
import { beforeEach, describe, expect, test, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  browserSession: vi.fn(),
  persistLoginReceipt: vi.fn(),
  prepareBrowserProfileDirectory: vi.fn(),
  waitForAuthenticationEvidence: vi.fn(),
}));

vi.mock("#/browser/session.js", () => ({
  browserSession: dependencies.browserSession,
}));

vi.mock("#/authentication-storage.js", () => ({
  prepareBrowserProfileDirectory: dependencies.prepareBrowserProfileDirectory,
}));

vi.mock("#/login/evidence.js", () => ({
  waitForAuthenticationEvidence: dependencies.waitForAuthenticationEvidence,
}));

vi.mock("#/login/receipt.js", () => ({
  persistLoginReceipt: dependencies.persistLoginReceipt,
}));

const profilePath = "/profile";
const lastArrayItem = -1;

function configureManagedBrowser(events: string[]): void {
  dependencies.browserSession.mockImplementation(function* manageBrowser() {
    const sessionFuture = yield* resource(function* provideBrowser(provide) {
      try {
        events.push("browser-ready");
        yield* provide({ profilePath });
      } finally {
        events.push("browser-released");
      }
    });
    return yield* wait(sessionFuture);
  });
}

describe("login workflow ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.prepareBrowserProfileDirectory.mockImplementation(function* prepareProfile() {
      yield* cede();
      return profilePath;
    });
  });

  test("releases the browser before persisting an authenticated receipt", async () => {
    const events: string[] = [];
    configureManagedBrowser(events);
    dependencies.waitForAuthenticationEvidence.mockImplementation(
      function* observeAuthentication() {
        events.push("authenticated");
        yield* cede();
      },
    );
    dependencies.persistLoginReceipt.mockImplementation(function* persistReceipt(
      platform: "boss",
      authenticatedAt: string,
    ) {
      events.push("persisted");
      yield* cede();
      return { authenticatedAt, platform, state: "persisted" } as const;
    });

    const receipt = await run(() => login("boss", vi.fn()));

    expect(receipt).toMatchObject({ platform: "boss", state: "persisted" });
    expect(events).toEqual(["browser-ready", "authenticated", "browser-released", "persisted"]);
  });

  test("releases the browser and skips persistence when authentication fails", async () => {
    const events: string[] = [];
    const progress: LoginProgressEvent[] = [];
    configureManagedBrowser(events);
    dependencies.waitForAuthenticationEvidence.mockImplementation(function* failAuthentication() {
      events.push("authentication-failed");
      yield* cede();
      throw new Error("authentication failed");
    });

    await expect(run(() => login("boss", (event) => progress.push(event)))).rejects.toBeDefined();

    expect(events).toEqual(["browser-ready", "authentication-failed", "browser-released"]);
    expect(dependencies.persistLoginReceipt).not.toHaveBeenCalled();
    expect(progress.at(lastArrayItem)?.state).toBe("failed");
  });
});
