import { contract } from "./internal/contract.ts";
import {
  minimumNonEmptyArrayLength,
  nonNegativeInteger,
  normalizedTimestamp,
  positiveInteger,
  trimmedNonEmptyString,
} from "./internal/contract-fields.ts";
import { JobSourceEngagement } from "./job-engagement.ts";
import { JobCardObservation, JobPostingDescription } from "./job-observation.ts";

export const NormalizedSalary = contract({
  currency: "'CNY'",
  "maximumK?": "number",
  minimumK: "number",
  "monthsPerYear?": "number",
  period: "'day' | 'hour' | 'month' | 'year'",
});
export type NormalizedSalary = typeof NormalizedSalary.infer;

export const JobPostingSource = JobCardObservation.merge({
  "description?": JobPostingDescription,
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
  "description?": JobPostingDescription,
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

export const SaveJobObservationResult = contract({
  job: JobPosting,
  outcome: "'created' | 'source-added' | 'source-updated' | 'unchanged'",
});
export type SaveJobObservationResult = typeof SaveJobObservationResult.infer;
