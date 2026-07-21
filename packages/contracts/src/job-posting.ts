import { contract } from "./internal/contract.ts";
import {
  minimumNonEmptyArrayLength,
  nonNegativeInteger,
  normalizedTimestamp,
  platformId,
  positiveInteger,
  trimmedNonEmptyString,
} from "./internal/contract-fields.ts";
import { JobSourceEngagement } from "./job-engagement.ts";

export const JobPostingObservation = contract({
  collectedAt: normalizedTimestamp,
  "company?": trimmedNonEmptyString,
  details: trimmedNonEmptyString.array(),
  discoveryUrl: trimmedNonEmptyString,
  "educationRequirement?": trimmedNonEmptyString,
  "experienceRequirement?": trimmedNonEmptyString,
  "externalJobId?": trimmedNonEmptyString,
  "jobUrl?": trimmedNonEmptyString,
  "location?": trimmedNonEmptyString,
  platformId,
  "salaryText?": trimmedNonEmptyString,
  summary: trimmedNonEmptyString,
  title: trimmedNonEmptyString,
});
export type JobPostingObservation = typeof JobPostingObservation.infer;

export const NormalizedSalary = contract({
  currency: "'CNY'",
  "maximumK?": "number",
  minimumK: "number",
  "monthsPerYear?": "number",
  period: "'day' | 'hour' | 'month' | 'year'",
});
export type NormalizedSalary = typeof NormalizedSalary.infer;

export const JobPostingSource = JobPostingObservation.merge({
  engagements: JobSourceEngagement.array(),
  id: positiveInteger,
  jobId: positiveInteger,
  lastCheckedAt: normalizedTimestamp,
  "normalizedSalary?": NormalizedSalary,
});
export type JobPostingSource = typeof JobPostingSource.infer;

export const JobPosting = contract({
  "company?": trimmedNonEmptyString,
  createdAt: normalizedTimestamp,
  details: trimmedNonEmptyString.array(),
  "educationRequirement?": trimmedNonEmptyString,
  "experienceRequirement?": trimmedNonEmptyString,
  id: positiveInteger,
  "location?": trimmedNonEmptyString,
  sources: JobPostingSource.array().atLeastLength(minimumNonEmptyArrayLength),
  summary: trimmedNonEmptyString,
  title: trimmedNonEmptyString,
  updatedAt: normalizedTimestamp,
});
export type JobPosting = typeof JobPosting.infer;

export const JobPostingPage = contract({
  jobs: JobPosting.array(),
  page: positiveInteger,
  pageCount: nonNegativeInteger,
  pageSize: positiveInteger,
  total: nonNegativeInteger,
});
export type JobPostingPage = typeof JobPostingPage.infer;

export const SaveJobPostingObservationResult = contract({
  job: JobPosting,
  outcome: "'created' | 'source-added' | 'source-updated' | 'unchanged'",
});
export type SaveJobPostingObservationResult = typeof SaveJobPostingObservationResult.infer;
