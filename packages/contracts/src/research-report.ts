import { contract } from "./internal/contract.ts";
import {
  normalizedTimestamp,
  positiveInteger,
  trimmedNonEmptyString,
} from "./internal/contract-fields.ts";

const minimumReportMarkdownLength = 1;

export const ResearchReportMarkdown = contract("string > 0").narrow(
  (value) => value.trim().length >= minimumReportMarkdownLength,
);

export const ResearchReportSummary = contract({
  createdAt: normalizedTimestamp,
  id: positiveInteger,
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
