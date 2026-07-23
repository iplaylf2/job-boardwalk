import { contract } from "./internal/contract.ts";
import {
  normalizedNonEmptyText,
  normalizedTimestamp,
  platformId,
  trimmedNonEmptyString,
} from "./internal/contract-fields.ts";

export const JobPostingDescription = contract({
  capturedAt: normalizedTimestamp,
  text: normalizedNonEmptyText,
  truncated: "boolean",
});
export type JobPostingDescription = typeof JobPostingDescription.infer;

export const JobCardObservation = contract({
  "company?": trimmedNonEmptyString,
  details: trimmedNonEmptyString.array(),
  discoveryUrl: trimmedNonEmptyString,
  "educationRequirement?": trimmedNonEmptyString,
  "experienceRequirement?": trimmedNonEmptyString,
  "externalJobId?": trimmedNonEmptyString,
  "jobUrl?": trimmedNonEmptyString,
  "location?": trimmedNonEmptyString,
  observedAt: normalizedTimestamp,
  platformId,
  "salaryText?": trimmedNonEmptyString,
  summary: trimmedNonEmptyString,
  title: trimmedNonEmptyString,
});
export type JobCardObservation = typeof JobCardObservation.infer;

export const JobDescriptionObservation = contract({
  "company?": trimmedNonEmptyString,
  description: JobPostingDescription,
  details: trimmedNonEmptyString.array(),
  "educationRequirement?": trimmedNonEmptyString,
  "experienceRequirement?": trimmedNonEmptyString,
  "externalJobId?": trimmedNonEmptyString,
  jobUrl: trimmedNonEmptyString,
  "location?": trimmedNonEmptyString,
  observedAt: normalizedTimestamp,
  platformId,
  "salaryText?": trimmedNonEmptyString,
  title: trimmedNonEmptyString,
});
export type JobDescriptionObservation = typeof JobDescriptionObservation.infer;
