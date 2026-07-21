import { contract } from "./internal/contract.ts";
import {
  normalizedTimestamp,
  positiveInteger,
  trimmedNonEmptyString,
} from "./internal/contract-fields.ts";

const minimumReportMarkdownLength = 1;

export const ResearchReportState = contract("'draft' | 'complete'");
export type ResearchReportState = typeof ResearchReportState.infer;

export const ResearchReportMarkdown = contract("string > 0").narrow(
  (value) => value.trim().length >= minimumReportMarkdownLength,
);

export const ResearchReportSummary = contract({
  createdAt: normalizedTimestamp,
  "expiresAt?": normalizedTimestamp,
  id: positiveInteger,
  state: ResearchReportState,
  title: trimmedNonEmptyString,
  updatedAt: normalizedTimestamp,
});
export type ResearchReportSummary = typeof ResearchReportSummary.infer;

export const ResearchReport = ResearchReportSummary.merge({
  markdown: ResearchReportMarkdown,
});
export type ResearchReport = typeof ResearchReport.infer;

export const ResearchReportList = contract({
  reports: ResearchReportSummary.array(),
});
export type ResearchReportList = typeof ResearchReportList.infer;
