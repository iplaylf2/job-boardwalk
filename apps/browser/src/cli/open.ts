import { branch } from "@shajara/host/primitives";
import type { RiteCoroutine } from "@shajara/host";

import { browserSession } from "#/browser/session.js";
import { platformConfigurations } from "#/platform-configurations.js";
import type { PlatformName } from "@job-boardwalk/platforms";
import { prepareBrowserProfileDirectory } from "#/authentication-storage.js";
import { waitForTerminalConfirmation } from "./prompt.js";

function* openBrowser(platformName: PlatformName, targetUrl: string, message: string) {
  const profilePath = yield* prepareBrowserProfileDirectory(platformName);
  yield* branch(function* browse() {
    yield* browserSession(profilePath, targetUrl, "none");
    yield* waitForTerminalConfirmation(message);
  });
}

export function* openPlatform(platformName: PlatformName): RiteCoroutine<void> {
  const { homeUrl, label } = platformConfigurations[platformName];
  yield* openBrowser(
    platformName,
    homeUrl,
    `已使用保存的浏览器资料打开${label}；浏览完成后按回车关闭浏览器…`,
  );
}
