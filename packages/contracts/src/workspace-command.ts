import { contract } from "./internal/contract.ts";
import {
  minimumNonEmptyArrayLength,
  normalizedTimestamp,
  trimmedNonEmptyString,
} from "./internal/contract-fields.ts";
import { JobPostingObservation } from "./job-posting.ts";
import { JobEngagementSnapshot } from "./job-engagement.ts";
import { ResearchReportMarkdown, ResearchReportState } from "./research-report.ts";
import { RecommendationPageReference } from "./search-intent.ts";

export const WorkspaceChangeAttribution = contract({
  initiatedBy: "'agent' | 'system' | 'user'",
  reason: trimmedNonEmptyString,
});
export type WorkspaceChangeAttribution = typeof WorkspaceChangeAttribution.infer;

const ProfileFactChange = contract({
  confirmed: "boolean",
  key: trimmedNonEmptyString,
  source: trimmedNonEmptyString,
  value: trimmedNonEmptyString,
});

export const CreateProfileFactCommand = WorkspaceChangeAttribution.merge(ProfileFactChange);
export type CreateProfileFactCommand = typeof CreateProfileFactCommand.infer;

export const UpdateProfileFactCommand = WorkspaceChangeAttribution.merge(ProfileFactChange);
export type UpdateProfileFactCommand = typeof UpdateProfileFactCommand.infer;

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
).merge({
  jobUrl: trimmedNonEmptyString,
});
export type SaveJobPostingObservationCommand = typeof SaveJobPostingObservationCommand.infer;

export const SynchronizeJobEngagementCommand = JobEngagementSnapshot.merge(
  WorkspaceChangeAttribution,
);
export type SynchronizeJobEngagementCommand = typeof SynchronizeJobEngagementCommand.infer;

export const SaveResearchReportCommand = WorkspaceChangeAttribution.merge({
  "expiresAt?": normalizedTimestamp,
  markdown: ResearchReportMarkdown,
  state: ResearchReportState,
  title: trimmedNonEmptyString,
});
export type SaveResearchReportCommand = typeof SaveResearchReportCommand.infer;
