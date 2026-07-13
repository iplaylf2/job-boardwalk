import type {
  OpenPlatformBrowserPurpose,
  OpenPlatformBrowserResult,
} from "@job-boardwalk/contracts";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import type { RiteCoroutine } from "@shajara/host";

import type { PlatformBrowser } from "./playwright-platform-browser.js";

export function* openPlatformBrowser(
  platformBrowser: PlatformBrowser,
  platformId: PlatformId,
  purpose: OpenPlatformBrowserPurpose,
): RiteCoroutine<OpenPlatformBrowserResult> {
  yield* platformBrowser.open(platformId, purpose);
  return {
    message: "招聘平台窗口已打开。请在窗口中完成登录、验证和其他账号操作。",
    platformId,
    purpose,
    status: "opened",
  };
}
