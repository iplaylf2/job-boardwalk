import type { JobDescriptionCaptureStatus, JobPostingSource } from "@job-boardwalk/contracts";

type DescriptionSourceEvidence = Pick<JobPostingSource, "description" | "externalJobId" | "jobUrl">;

export function jobDescriptionCaptureStatus(
  source: DescriptionSourceEvidence,
): JobDescriptionCaptureStatus {
  if (source.description) {
    return "captured";
  }
  return source.externalJobId || source.jobUrl ? "uncaptured" : "identity-unresolved";
}
