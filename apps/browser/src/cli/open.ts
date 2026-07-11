import { startBrowserSession, stopBrowserSession } from "#/browser/session.js";
import { platforms } from "#/platforms.js";
import type { PlatformName } from "#/platforms.js";
import { prepareBrowserProfileDirectory } from "#/session-storage.js";
import { waitForTerminalConfirmation } from "./prompt.js";

async function openBrowser(
  platformName: PlatformName,
  targetUrl: string,
  message: string,
): Promise<void> {
  const profilePath = await prepareBrowserProfileDirectory(platformName);
  const session = await startBrowserSession(profilePath, targetUrl, "none");
  try {
    await waitForTerminalConfirmation(message);
  } finally {
    await stopBrowserSession(session);
  }
}

export async function openPlatform(platformName: PlatformName): Promise<void> {
  const { homeUrl, label } = platforms[platformName];
  await openBrowser(
    platformName,
    homeUrl,
    `已使用本地配置打开${label}；浏览完成后按回车关闭浏览器…`,
  );
}
