import { contract } from "./internal/contract.ts";
import {
  nonNegativeInteger,
  normalizedTimestamp,
  platformId,
  positiveInteger,
  trimmedNonEmptyString,
} from "./internal/contract-fields.ts";

export const JobSourceInterest = contract({
  firstObservedAt: normalizedTimestamp,
  lastObservedAt: normalizedTimestamp,
  position: positiveInteger,
});
export type JobSourceInterest = typeof JobSourceInterest.infer;

export const JobInterestEvidence = contract({
  "company?": trimmedNonEmptyString,
  details: trimmedNonEmptyString.array(),
  "educationRequirement?": trimmedNonEmptyString,
  "experienceRequirement?": trimmedNonEmptyString,
  "externalJobId?": trimmedNonEmptyString,
  "jobUrl?": trimmedNonEmptyString,
  "location?": trimmedNonEmptyString,
  "salaryText?": trimmedNonEmptyString,
  summary: trimmedNonEmptyString,
  title: trimmedNonEmptyString,
});
export type JobInterestEvidence = typeof JobInterestEvidence.infer;

export const JobInterestSnapshot = contract({
  capturedAt: normalizedTimestamp,
  complete: "boolean",
  jobs: JobInterestEvidence.array(),
  platformId,
  sourceUrl: trimmedNonEmptyString,
  total: nonNegativeInteger,
});
export type JobInterestSnapshot = typeof JobInterestSnapshot.infer;

export const SynchronizeJobInterestsResult = contract({
  complete: "boolean",
  observed: nonNegativeInteger,
  platformId,
  removed: nonNegativeInteger,
  synchronizedAt: normalizedTimestamp,
});
export type SynchronizeJobInterestsResult = typeof SynchronizeJobInterestsResult.infer;
