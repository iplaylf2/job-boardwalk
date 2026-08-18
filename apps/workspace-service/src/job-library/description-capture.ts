import type {
  JobDescriptionCaptureStatus,
  JobDescriptionCoverage,
  JobDescriptionStatusFilter,
  JobPosting,
  JobPostingSource,
} from "@job-boardwalk/contracts";

type DescriptionSourceEvidence = Pick<JobPostingSource, "description" | "externalJobId" | "jobUrl">;

export function jobDescriptionCaptureStatus(
  source: DescriptionSourceEvidence,
): JobDescriptionCaptureStatus {
  if (source.description) {
    return "captured";
  }
  return source.externalJobId || source.jobUrl ? "uncaptured" : "identity-unresolved";
}

function hasOnlyIdentityUnresolvedSources(job: JobPosting): boolean {
  return (
    !job.description &&
    job.sources.every(
      ({ descriptionCaptureStatus }) => descriptionCaptureStatus === "identity-unresolved",
    )
  );
}

export function summarizeJobDescriptionCoverage(
  jobs: readonly JobPosting[],
): JobDescriptionCoverage {
  const captured = jobs.filter((job) => job.description).length;
  const identityUnresolved = jobs.filter(hasOnlyIdentityUnresolvedSources).length;
  return {
    captured,
    identityUnresolved,
    total: jobs.length,
    uncaptured: jobs.length - captured - identityUnresolved,
  };
}

export function matchesJobDescriptionStatus(
  job: JobPosting,
  status: JobDescriptionStatusFilter | undefined,
): boolean {
  if (!status) {
    return true;
  }
  if (status === "captured") {
    return Boolean(job.description);
  }
  if (status === "identity-unresolved") {
    return hasOnlyIdentityUnresolvedSources(job);
  }
  return !job.description;
}
