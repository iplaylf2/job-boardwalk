import { platformJobEngagementKinds } from "@job-boardwalk/platform-catalog";

import { contract } from "./internal/contract.ts";
import {
  nonNegativeInteger,
  normalizedTimestamp,
  platformId,
  trimmedNonEmptyString,
} from "./internal/contract-fields.ts";

export const JobEngagementKind = contract.enumerated(...platformJobEngagementKinds);
export type JobEngagementKind = typeof JobEngagementKind.infer;

export const JobSourceEngagement = contract({
  firstObservedAt: normalizedTimestamp,
  kind: JobEngagementKind,
  lastObservedAt: normalizedTimestamp,
});
export type JobSourceEngagement = typeof JobSourceEngagement.infer;

export const JobEngagementEvidence = contract({
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
export type JobEngagementEvidence = typeof JobEngagementEvidence.infer;

export const JobEngagementSnapshot = contract({
  capturedAt: normalizedTimestamp,
  complete: "boolean",
  engagement: JobEngagementKind,
  jobs: JobEngagementEvidence.array(),
  platformId,
  sourceUrl: trimmedNonEmptyString,
  total: nonNegativeInteger,
});
export type JobEngagementSnapshot = typeof JobEngagementSnapshot.infer;

export const SynchronizeJobEngagementResult = contract({
  complete: "boolean",
  engagement: JobEngagementKind,
  observed: nonNegativeInteger,
  platformId,
  removed: nonNegativeInteger,
  synchronizedAt: normalizedTimestamp,
});
export type SynchronizeJobEngagementResult = typeof SynchronizeJobEngagementResult.infer;
