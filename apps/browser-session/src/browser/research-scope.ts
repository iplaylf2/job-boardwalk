import { platformCatalog } from "@job-boardwalk/platform-catalog";
import type { PlatformId } from "@job-boardwalk/platform-catalog";

const researchPlatformId = "boss" satisfies PlatformId;
const researchHostnameSuffix = "zhipin.com";
// eslint-disable-next-line no-script-url
const scriptUrlProtocol = "javascript:";

export const researchEntryUrl = platformCatalog[researchPlatformId].entryUrl;

export function isResearchUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === researchHostnameSuffix ||
        url.hostname.endsWith(`.${researchHostnameSuffix}`))
    );
  } catch {
    return false;
  }
}

export function assertResearchUrl(url: string): void {
  if (!isResearchUrl(url)) {
    throw new Error("页面必须位于当前 BOSS HTTPS 研究范围。");
  }
}

export function assertResearchLink(href: string): void {
  const url = new URL(href);
  if (url.protocol !== scriptUrlProtocol) {
    assertResearchUrl(href);
  }
}
