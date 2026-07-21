import { contract } from "./internal/contract.ts";
import {
  normalizedTimestamp,
  platformId,
  trimmedNonEmptyString,
} from "./internal/contract-fields.ts";

export const JobCardEvidence = contract({
  "company?": trimmedNonEmptyString,
  details: trimmedNonEmptyString.array(),
  "educationRequirement?": trimmedNonEmptyString,
  "experienceRequirement?": trimmedNonEmptyString,
  href: trimmedNonEmptyString,
  "location?": trimmedNonEmptyString,
  "salary?": trimmedNonEmptyString,
  text: trimmedNonEmptyString,
  title: trimmedNonEmptyString,
});
export type JobCardEvidence = typeof JobCardEvidence.infer;

export const JobCardSnapshot = contract({
  capturedAt: normalizedTimestamp,
  cards: JobCardEvidence.array(),
  platformId,
  sourceTitle: trimmedNonEmptyString,
  sourceUrl: trimmedNonEmptyString,
  truncated: "boolean",
});
export type JobCardSnapshot = typeof JobCardSnapshot.infer;
