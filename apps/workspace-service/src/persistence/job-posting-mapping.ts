import type { JobPosting, JobPostingSource, JobSourceEngagement } from "@job-boardwalk/contracts";
import { isPlatformId } from "@job-boardwalk/platform-catalog";
import { parseJobPostingSalary } from "#/job-library/salary.js";
import { jobDescriptionCaptureStatus } from "#/job-library/description-capture.js";
import type { JobPostingRow, JobPostingSourceRow, JobSourceEngagementRow } from "./schema.js";
import { jobSourceEvidence } from "./job-evidence.js";

function toJobSourceEngagement(row: JobSourceEngagementRow): JobSourceEngagement {
  return {
    firstObservedAt: row.firstObservedAt,
    kind: row.kind,
    lastObservedAt: row.lastObservedAt,
  };
}

function toJobPostingSource(
  row: JobPostingSourceRow,
  engagementRows: JobSourceEngagementRow[],
): JobPostingSource {
  if (!isPlatformId(row.platformId)) {
    throw new Error(`数据库中存在未知招聘平台：${row.platformId}`);
  }
  const evidence = jobSourceEvidence(row.cardObservation, row.descriptionObservation);
  const normalizedSalary = evidence.salaryText ? parseJobPostingSalary(evidence.salaryText) : null;
  return {
    ...evidence,
    descriptionCaptureStatus: jobDescriptionCaptureStatus(evidence),
    ...(row.descriptionObservation?.recruitment
      ? { recruitment: row.descriptionObservation.recruitment }
      : {}),
    engagements: engagementRows
      .filter(({ sourceId }) => sourceId === row.id)
      .map(toJobSourceEngagement),
    id: row.id,
    jobId: row.jobId,
    lastCheckedAt: row.lastCheckedAt,
    ...(normalizedSalary ? { normalizedSalary } : {}),
  };
}

export function toJobPosting(
  job: JobPostingRow,
  sourceRows: JobPostingSourceRow[],
  engagementRows: JobSourceEngagementRow[],
): JobPosting {
  return {
    ...(job.company ? { company: job.company } : {}),
    createdAt: job.createdAt,
    ...(job.description ? { description: job.description } : {}),
    details: job.details,
    ...(job.educationRequirement ? { educationRequirement: job.educationRequirement } : {}),
    ...(job.experienceRequirement ? { experienceRequirement: job.experienceRequirement } : {}),
    id: job.id,
    ...(job.location ? { location: job.location } : {}),
    sources: sourceRows
      .filter((source) => source.jobId === job.id)
      .map((source) => toJobPostingSource(source, engagementRows)),
    summary: job.summary,
    title: job.title,
    updatedAt: job.updatedAt,
  };
}
