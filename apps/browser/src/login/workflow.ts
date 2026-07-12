import { branch } from "@shajara/host/primitives";
import type { RiteCoroutine } from "@shajara/host";

import { browserSession } from "#/browser/session.js";
import { platforms } from "#/platforms.js";
import type { PlatformName } from "#/platforms.js";
import { prepareBrowserProfileDirectory } from "#/session-storage.js";
import { waitForAuthenticationEvidence } from "./evidence.js";
import { LoginProgressReporter } from "./progress.js";
import type { LoginProgressWriter } from "./progress.js";
import { persistLoginReceipt } from "./receipt.js";
import type { LoginReceipt } from "./receipt.js";

export function* login(
  platformName: PlatformName,
  writeProgress: LoginProgressWriter,
): RiteCoroutine<LoginReceipt> {
  const platform = platforms[platformName];
  const reporter = new LoginProgressReporter(`正在打开${platform.label}登录页`, writeProgress);
  try {
    const profilePath = yield* prepareBrowserProfileDirectory(platformName);
    const controlMode =
      platform.authenticationEvidence.kind === "cdp-cookie-names" ? "cdp" : "none";
    const authenticatedAt = yield* branch(function* authenticate() {
      const session = yield* browserSession(profilePath, platform.loginUrl, controlMode);
      reporter.transition("awaiting-user", `请在浏览器中完成${platform.label}登录`);
      yield* waitForAuthenticationEvidence(session, platform.authenticationEvidence);
      const completedAt = new Date().toISOString();
      reporter.transition("authenticated", `已确认${platform.label}登录`);
      return completedAt;
    });
    const receipt = yield* persistLoginReceipt(platformName, authenticatedAt);
    reporter.transition("persisted", `${platform.label}登录状态已保存，可供后续复用`);
    return receipt;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    reporter.transition("failed", `${platform.label}登录失败：${detail}`);
    throw error;
  }
}
