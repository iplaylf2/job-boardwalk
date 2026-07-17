import { contract } from "./internal/contract.ts";
import { minimumNonEmptyArrayLength, trimmedNonEmptyString } from "./internal/contract-fields.ts";
import { JobPostingObservation } from "./job-posting.ts";
import { RecommendationPageReference } from "./search-intent.ts";

export const WorkspaceChangeAttribution = contract({
  initiatedBy: "'agent' | 'system' | 'user'",
  reason: trimmedNonEmptyString,
});
export type WorkspaceChangeAttribution = typeof WorkspaceChangeAttribution.infer;

export const SaveProfileFactCommand = WorkspaceChangeAttribution.merge({
  confirmed: "boolean",
  key: trimmedNonEmptyString,
  source: trimmedNonEmptyString,
  value: trimmedNonEmptyString,
});
export type SaveProfileFactCommand = typeof SaveProfileFactCommand.infer;

export const SaveJobSearchIntentCommand = WorkspaceChangeAttribution.merge({
  city: trimmedNonEmptyString,
  name: trimmedNonEmptyString,
  position: trimmedNonEmptyString,
  recommendationPages: RecommendationPageReference.array().atLeastLength(
    minimumNonEmptyArrayLength,
  ),
  selected: "boolean",
});
export type SaveJobSearchIntentCommand = typeof SaveJobSearchIntentCommand.infer;

export const SaveJobPostingObservationCommand = JobPostingObservation.merge(
  WorkspaceChangeAttribution,
);
export type SaveJobPostingObservationCommand = typeof SaveJobPostingObservationCommand.infer;
