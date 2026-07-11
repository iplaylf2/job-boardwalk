import { startBrowserSession, stopBrowserSession } from "#/browser/session.js";
import { platforms } from "#/platforms.js";
import type { PlatformName } from "#/platforms.js";
import { prepareBrowserProfileDirectory } from "#/session-storage.js";
import { waitForAuthenticationEvidence } from "./evidence.js";
import { LoginProgressReporter } from "./progress.js";
import type { LoginProgressWriter } from "./progress.js";
import { persistLoginReceipt } from "./receipt.js";
import type { LoginReceipt } from "./receipt.js";

export async function login(
  platformName: PlatformName,
  writeProgress: LoginProgressWriter,
): Promise<LoginReceipt> {
  const platform = platforms[platformName];
  const reporter = new LoginProgressReporter(`正在打开${platform.label}登录页`, writeProgress);
  try {
    const profilePath = await prepareBrowserProfileDirectory(platformName);
    const controlMode =
      platform.authenticationEvidence.kind === "cdp-cookie-names" ? "cdp" : "none";
    const session = await startBrowserSession(profilePath, platform.loginUrl, controlMode);
    return await completeLogin(platformName, session, reporter);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    reporter.transition("failed", `${platform.label}登录失败：${detail}`);
    throw error;
  }
}

async function completeLogin(
  platformName: PlatformName,
  session: Awaited<ReturnType<typeof startBrowserSession>>,
  reporter: LoginProgressReporter,
): Promise<LoginReceipt> {
  const platform = platforms[platformName];
  try {
    reporter.transition("awaiting-user", `请在浏览器中完成${platform.label}登录`);
    await waitForAuthenticationEvidence(session, platform.authenticationEvidence);
    const authenticatedAt = new Date().toISOString();
    reporter.transition("authenticated", `已确认${platform.label}登录`);
    await stopBrowserSession(session);
    const receipt = await persistLoginReceipt(platformName, authenticatedAt);
    reporter.transition("persisted", `${platform.label}登录状态已保存，可供后续复用`);
    return receipt;
  } catch (error) {
    await stopBrowserSession(session);
    throw error;
  }
}
