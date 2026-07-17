import { platformIds } from "@job-boardwalk/platform-catalog";

import { toolInput } from "#/mcp/contract.js";

const PlatformId = toolInput.enumerated(...platformIds);
const OptionalTabId = toolInput("number.integer >= 1");
const ElementReference = toolInput("string > 0");

const BrowserStatusInput = toolInput({});

const BrowserTabsInput = toolInput({
  action: "'list' | 'ensure' | 'activate'",
  "platformId?": PlatformId,
  "tabId?": OptionalTabId,
  "url?": "string",
});

const BrowserPrepareLoginInput = toolInput({
  platformId: PlatformId,
});

const BrowserNavigateInput = toolInput({
  "tabId?": OptionalTabId,
  url: "string > 0",
});

const BrowserSnapshotInput = toolInput({
  maxTextCharacters: "1000 <= number <= 40000 = 40000",
  "tabId?": OptionalTabId,
});

const BrowserJobCardSnapshotInput = toolInput({
  maximumCards: "1 <= number.integer <= 100 = 50",
  "tabId?": OptionalTabId,
});

const BrowserClickInput = toolInput({
  ref: ElementReference,
});

const BrowserFillInput = toolInput({
  ref: ElementReference,
  value: "string > 0",
});

const BrowserSelectInput = toolInput({
  ref: ElementReference,
  value: "string > 0",
});

const BrowserScrollInput = toolInput({
  deltaY: "-5000 <= number <= 5000 = 600",
  "ref?": "string",
  "tabId?": OptionalTabId,
});

const BrowserWaitInput = toolInput({
  milliseconds: "0 <= number <= 10000",
});

export const browserToolInputContracts = {
  browser_click: BrowserClickInput,
  browser_fill: BrowserFillInput,
  browser_job_card_snapshot: BrowserJobCardSnapshotInput,
  browser_navigate: BrowserNavigateInput,
  browser_prepare_login: BrowserPrepareLoginInput,
  browser_scroll: BrowserScrollInput,
  browser_select: BrowserSelectInput,
  browser_snapshot: BrowserSnapshotInput,
  browser_status: BrowserStatusInput,
  browser_tabs: BrowserTabsInput,
  browser_wait: BrowserWaitInput,
} as const;

export type BrowserToolName = keyof typeof browserToolInputContracts;

export function isBrowserToolName(value: string): value is BrowserToolName {
  return Object.hasOwn(browserToolInputContracts, value);
}

export function parseBrowserToolInput(
  toolName: BrowserToolName,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = browserToolInputContracts[toolName](input);
  if (parsed instanceof toolInput.errors) {
    throw new TypeError(parsed.summary);
  }
  return parsed as Record<string, unknown>;
}
