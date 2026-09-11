import { contract } from "./internal/contract.ts";
import {
  normalizedTimestamp,
  nonNegativeInteger,
  platformId,
  positiveInteger,
  trimmedNonEmptyString,
} from "./internal/contract-fields.ts";

const minimumReportMarkdownLength = 1;

export const ResearchReportState = contract("'draft' | 'complete'");
export type ResearchReportState = typeof ResearchReportState.infer;

export const ResearchReportMarkdown = contract("string > 0").narrow(
  (value) => value.trim().length >= minimumReportMarkdownLength,
);

export const ResearchReportEntryDisposition = contract("'recommended' | 'pending' | 'excluded'");
export type ResearchReportEntryDisposition = typeof ResearchReportEntryDisposition.infer;

export const ResearchReportEntry = contract({
  assessedAt: normalizedTimestamp,
  basis: trimmedNonEmptyString,
  disposition: ResearchReportEntryDisposition,
  sourceId: positiveInteger,
});
export type ResearchReportEntry = typeof ResearchReportEntry.infer;

export const ResearchReportPlatformTarget = contract({
  count: positiveInteger,
  "nextStep?": trimmedNonEmptyString,
  platformId,
});
export type ResearchReportPlatformTarget = typeof ResearchReportPlatformTarget.infer;

export const ResearchReportPlatformProgress = ResearchReportPlatformTarget.merge({
  excluded: nonNegativeInteger,
  pending: nonNegativeInteger,
  recommended: nonNegativeInteger,
  remaining: nonNegativeInteger,
});
export type ResearchReportPlatformProgress = typeof ResearchReportPlatformProgress.infer;

export const ResearchReportFilter = contract({
  "disposition?": ResearchReportEntryDisposition,
  "includeExpired?": "boolean",
  "sourceId?": positiveInteger,
});
export type ResearchReportFilter = typeof ResearchReportFilter.infer;

export const ResearchReportSummary = contract({
  createdAt: normalizedTimestamp,
  "expiresAt?": normalizedTimestamp,
  id: positiveInteger,
  progress: ResearchReportPlatformProgress.array(),
  state: ResearchReportState,
  title: trimmedNonEmptyString,
  updatedAt: normalizedTimestamp,
});
export type ResearchReportSummary = typeof ResearchReportSummary.infer;

export const ResearchReport = ResearchReportSummary.merge({
  entries: ResearchReportEntry.array(),
  markdown: ResearchReportMarkdown,
  targets: ResearchReportPlatformTarget.array(),
});
export type ResearchReport = typeof ResearchReport.infer;

export const ResearchReportList = contract({
  reports: ResearchReportSummary.array(),
});
export type ResearchReportList = typeof ResearchReportList.infer;
