import { platformCatalog } from "@job-boardwalk/platform-catalog";
import type { PlatformId } from "@job-boardwalk/platform-catalog";

const bossPlatformId = "boss" satisfies PlatformId;
const bossHostnameSuffix = "zhipin.com";
// eslint-disable-next-line no-script-url
const scriptUrlProtocol = "javascript:";

export const bossEntryUrl = platformCatalog[bossPlatformId].entryUrl;

export function isBossNavigationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === bossHostnameSuffix || url.hostname.endsWith(`.${bossHostnameSuffix}`))
    );
  } catch {
    return false;
  }
}

export function assertBossNavigationUrl(url: string): void {
  if (!isBossNavigationUrl(url)) {
    throw new Error("页面必须位于当前 BOSS HTTPS 导航范围。");
  }
}

export function assertBossNavigationLink(href: string): void {
  const url = new URL(href);
  if (url.protocol !== scriptUrlProtocol) {
    assertBossNavigationUrl(href);
  }
}
