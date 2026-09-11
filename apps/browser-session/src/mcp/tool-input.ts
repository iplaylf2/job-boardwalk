import { platformIds, platformJobEngagementKinds } from "@job-boardwalk/platform-catalog";

import { toolInput } from "#/mcp/contract.js";

const PlatformId = toolInput.enumerated(...platformIds);
const JobEngagementKind = toolInput.enumerated(...platformJobEngagementKinds);
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
  "tabId?": OptionalTabId,
  "userReturnedControl?": "boolean",
});

const BrowserJobCardSnapshotInput = toolInput({
  "tabId?": OptionalTabId,
  waitFor: "'none' | 'cards-present' = 'none'",
});

const BrowserJobDescriptionSnapshotInput = toolInput({
  "sourceId?": "number.integer >= 1",
  "tabId?": OptionalTabId,
});

const BrowserSyncJobEngagementInput = toolInput({
  engagement: JobEngagementKind,
  platformId: PlatformId,
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

const BrowserRevealInput = toolInput({
  ref: ElementReference,
});

const BrowserScrollInput = toolInput({
  direction: "'down' | 'up'",
  "ref?": ElementReference,
  "tabId?": OptionalTabId,
});

export const browserToolInputContracts = {
  browser_click: BrowserClickInput,
  browser_fill: BrowserFillInput,
  browser_job_card_snapshot: BrowserJobCardSnapshotInput,
  browser_job_description_snapshot: BrowserJobDescriptionSnapshotInput,
  browser_navigate: BrowserNavigateInput,
  browser_prepare_login: BrowserPrepareLoginInput,
  browser_reveal: BrowserRevealInput,
  browser_scroll: BrowserScrollInput,
  browser_select: BrowserSelectInput,
  browser_snapshot: BrowserSnapshotInput,
  browser_status: BrowserStatusInput,
  browser_sync_job_engagement: BrowserSyncJobEngagementInput,
  browser_tabs: BrowserTabsInput,
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
