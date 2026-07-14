import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { PlatformAccessAssessment } from "@job-boardwalk/contracts";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import type { RiteCoroutine } from "@shajara/host";

import { assessPlatformAccess } from "./assess-platform-access.js";
import type { PlatformPageSnapshot } from "./assess-platform-access.js";
import { platformPageRules } from "./platform-page-rules.js";

const platformPageSnapshotMarker = "JOB_BOARDWALK_PLATFORM_PAGE_SNAPSHOT:";
const platformPageSnapshotPattern =
  /JOB_BOARDWALK_PLATFORM_PAGE_SNAPSHOT:(?<payload>[A-Za-z\d+/=]+)/u;
const maximumObservedTextLength = 8000;
const verificationSelectors = [
  "iframe[src*='captcha' i]",
  "[id*='captcha' i]",
  "[class*='captcha' i]",
  "[id*='verify' i]",
  "[class*='verify' i]",
  "[aria-label*='验证']",
] as const;

interface BrowserToolClient {
  callTool: (params: {
    arguments?: Record<string, unknown>;
    name: string;
  }) => RiteCoroutine<CallToolResult>;
}

function createSnapshotEvaluation(platformId: PlatformId): string {
  const rules = platformPageRules[platformId];
  return `() => {
    const visible = (selectors) => selectors.some((selector) =>
      [...document.querySelectorAll(selector)].some((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0;
      })
    );
    const snapshot = {
      accountIdentityVisible: visible(${JSON.stringify(rules.accountIdentitySelectors)}),
      verificationControlVisible: visible(${JSON.stringify(verificationSelectors)}),
      loginControlVisible: visible(${JSON.stringify(rules.loginSelectors)}),
      text: (document.body?.innerText ?? "").slice(0, ${maximumObservedTextLength}),
      title: document.title,
      url: location.href,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return "${platformPageSnapshotMarker}" + btoa(binary);
  }`;
}

function parsePlatformPageSnapshot(result: CallToolResult): PlatformPageSnapshot {
  const text = result.content
    .filter(
      (content): content is Extract<(typeof result.content)[number], { type: "text" }> =>
        content.type === "text",
    )
    .map((content) => content.text)
    .join("\n");
  const payload = platformPageSnapshotPattern.exec(text)?.groups?.["payload"];
  if (!payload) {
    throw new Error("上游 Playwright MCP 未返回可解析的平台页面快照。");
  }
  const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as Omit<
    PlatformPageSnapshot,
    "url"
  > & { url: string };
  return { ...parsed, url: new URL(parsed.url) };
}

export function* observePlatformAccess(
  browser: BrowserToolClient,
  platformId: PlatformId,
): RiteCoroutine<PlatformAccessAssessment | null> {
  const result = yield* browser.callTool({
    arguments: { function: createSnapshotEvaluation(platformId) },
    name: "browser_evaluate",
  });
  const snapshot = parsePlatformPageSnapshot(result);
  const rules = platformPageRules[platformId];
  if (!rules.hostnames.some((hostname) => hostname === snapshot.url.hostname)) {
    throw new Error(`当前标签页不属于 ${platformId} 平台：${snapshot.url.hostname}`);
  }
  return assessPlatformAccess({ rules, snapshot });
}
