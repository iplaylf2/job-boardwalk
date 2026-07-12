import { branch } from "@shajara/host/primitives";
import type { RiteCoroutine } from "@shajara/host";

import { browserSession } from "#/browser/session.js";
import { platforms } from "#/platforms.js";
import type { PlatformName } from "#/platforms.js";
import { prepareBrowserProfileDirectory } from "#/session-storage.js";
import { waitForTerminalConfirmation } from "./prompt.js";

function* openBrowser(platformName: PlatformName, targetUrl: string, message: string) {
  const profilePath = yield* prepareBrowserProfileDirectory(platformName);
  yield* branch(function* browse() {
    yield* browserSession(profilePath, targetUrl, "none");
    yield* waitForTerminalConfirmation(message);
  });
}

export function* openPlatform(platformName: PlatformName): RiteCoroutine<void> {
  const { homeUrl, label } = platforms[platformName];
  yield* openBrowser(
    platformName,
    homeUrl,
    `已使用本地配置打开${label}；浏览完成后按回车关闭浏览器…`,
  );
}
