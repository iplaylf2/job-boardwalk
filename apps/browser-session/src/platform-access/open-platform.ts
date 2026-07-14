import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { PlatformAccessOutcome } from "@job-boardwalk/contracts";
import { platformCatalog } from "@job-boardwalk/platform-catalog";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import type { RiteCoroutine } from "@shajara/host";

import { observePlatformAccess } from "./observe-platform-access.js";
import { toPlatformAccessOutcome } from "./platform-access-outcome.js";

interface BrowserToolClient {
  callTool: (params: {
    arguments?: Record<string, unknown>;
    name: string;
  }) => RiteCoroutine<CallToolResult>;
}

function readErrorText(result: CallToolResult): string {
  return result.content
    .filter(
      (content): content is Extract<(typeof result.content)[number], { type: "text" }> =>
        content.type === "text",
    )
    .map(({ text }) => text)
    .join("\n");
}

export function* openPlatform(
  browser: BrowserToolClient,
  platformId: PlatformId,
): RiteCoroutine<PlatformAccessOutcome> {
  const navigationResult = yield* browser.callTool({
    arguments: { action: "new", url: platformCatalog[platformId].entryUrl },
    name: "browser_tabs",
  });
  if (navigationResult.isError) {
    const detail = readErrorText(navigationResult);
    throw new Error(`无法打开${platformCatalog[platformId].label}${detail ? `：${detail}` : "。"}`);
  }
  return toPlatformAccessOutcome(yield* observePlatformAccess(browser, platformId));
}
