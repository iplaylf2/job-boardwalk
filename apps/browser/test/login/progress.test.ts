import { LoginProgressReporter } from "#/login/progress.js";
import { describe, expect, test, vi } from "vitest";

describe("LoginProgressReporter", () => {
  test("accepts the complete login transition sequence", () => {
    const writer = vi.fn();
    const reporter = new LoginProgressReporter("starting", writer);
    reporter.transition("awaiting-user", "waiting");
    reporter.transition("authenticated", "authenticated");
    reporter.transition("persisted", "persisted");
    expect(writer.mock.calls).toEqual([
      [{ detail: "starting", state: "starting" }],
      [{ detail: "waiting", state: "awaiting-user" }],
      [{ detail: "authenticated", state: "authenticated" }],
      [{ detail: "persisted", state: "persisted" }],
    ]);
  });

  test("rejects a skipped login transition", () => {
    const reporter = new LoginProgressReporter("starting", vi.fn());
    expect(() => reporter.transition("persisted", "persisted")).toThrow("无效登录状态迁移");
  });

  test("allows failure from a non-terminal state", () => {
    const reporter = new LoginProgressReporter("starting", vi.fn());
    reporter.transition("awaiting-user", "waiting");
    reporter.transition("failed", "failed");
    expect(() => reporter.transition("starting", "starting")).toThrow("无效登录状态迁移");
  });
});
