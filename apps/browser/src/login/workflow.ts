import { branch } from "@shajara/host/primitives";
import type { RiteCoroutine } from "@shajara/host";

import { browserSession } from "#/browser/session.js";
import { platformConfigurations } from "#/platform-configurations.js";
import type { LoginReceipt, PlatformName } from "@job-boardwalk/platforms";
import { prepareBrowserProfileDirectory } from "#/authentication-storage.js";
import { waitForAuthenticationEvidence } from "./evidence.js";
import { LoginProgressReporter } from "./progress.js";
import type { LoginProgressWriter } from "./progress.js";
import { persistLoginReceipt } from "./receipt.js";

export function* login(
  platformName: PlatformName,
  writeProgress: LoginProgressWriter,
): RiteCoroutine<LoginReceipt> {
  const configuration = platformConfigurations[platformName];
  const reporter = new LoginProgressReporter(`正在打开${configuration.label}登录页`, writeProgress);
  try {
    const profilePath = yield* prepareBrowserProfileDirectory(platformName);
    const controlMode =
      configuration.authenticationEvidence.kind === "cdp-cookie-names" ? "cdp" : "none";
    const authenticatedAt = yield* branch(function* authenticate() {
      const session = yield* browserSession(profilePath, configuration.loginUrl, controlMode);
      reporter.transition("awaiting-user", `请在浏览器中完成${configuration.label}登录`);
      yield* waitForAuthenticationEvidence(session, configuration.authenticationEvidence);
      const completedAt = new Date().toISOString();
      reporter.transition("authenticated", `已确认${configuration.label}登录`);
      return completedAt;
    });
    const receipt = yield* persistLoginReceipt(platformName, authenticatedAt);
    reporter.transition(
      "persisted",
      `${configuration.label}登录记录已保存；浏览器资料可供后续复用`,
    );
    return receipt;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    reporter.transition("failed", `${configuration.label}登录失败：${detail}`);
    throw error;
  }
}
