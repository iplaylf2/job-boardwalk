import type { PlatformId } from "@job-boardwalk/platform-catalog";

export interface JobPostingObservation {
  collectedAt: string;
  company?: string;
  details: string[];
  discoveryUrl: string;
  educationRequirement?: string;
  experienceRequirement?: string;
  externalJobId?: string;
  jobUrl: string;
  location?: string;
  platformId: PlatformId;
  salaryText?: string;
  summary: string;
  title: string;
}

export interface NormalizedSalary {
  currency: "CNY";
  maximumK?: number;
  minimumK: number;
  monthsPerYear?: number;
  period: "day" | "hour" | "month" | "year";
}

export interface JobPostingSource extends JobPostingObservation {
  id: number;
  jobId: number;
  lastCheckedAt: string;
  normalizedSalary?: NormalizedSalary;
}

export interface JobPosting {
  company?: string;
  createdAt: string;
  details: string[];
  educationRequirement?: string;
  experienceRequirement?: string;
  id: number;
  location?: string;
  sources: JobPostingSource[];
  summary: string;
  title: string;
  updatedAt: string;
}

export interface JobPostingPage {
  jobs: JobPosting[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
}

export interface SaveJobPostingObservationResult {
  job: JobPosting;
  outcome: "created" | "source-added" | "source-updated" | "unchanged";
}
