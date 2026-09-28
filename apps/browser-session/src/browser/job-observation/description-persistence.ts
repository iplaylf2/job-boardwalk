import type {
  JobDescriptionObservation,
  JobPostingSource,
  SaveJobObservationResult,
} from "@job-boardwalk/contracts";

type SourceSummary = Pick<
  JobPostingSource,
  "platformId" | "engagements" | "observedAt" | "lastCheckedAt"
> & {
  current: boolean;
  sourceId: number;
  externalJobId: string | undefined;
  jobUrl: string | undefined;
  recruitment: JobPostingSource["recruitment"];
};

function isCurrentSource(
  source: JobPostingSource,
  observation: JobDescriptionObservation,
  boundSourceId?: number,
): boolean {
  if (source.platformId !== observation.platformId) {
    return false;
  }
  if (boundSourceId) {
    return source.id === boundSourceId;
  }
  if (observation.externalJobId) {
    return source.externalJobId === observation.externalJobId;
  }
  return Boolean(
    source.jobUrl && new URL(source.jobUrl).pathname === new URL(observation.jobUrl).pathname,
  );
}

export function summarizeDescriptionPersistence(
  result: SaveJobObservationResult,
  observation: JobDescriptionObservation,
  boundSourceId?: number,
): { jobId: number; outcome: SaveJobObservationResult["outcome"]; sources: SourceSummary[] } {
  return {
    jobId: result.job.id,
    outcome: result.outcome,
    sources: result.job.sources.map((source) => ({
      current: isCurrentSource(source, observation, boundSourceId),
      engagements: source.engagements,
      externalJobId: source.externalJobId,
      jobUrl: source.jobUrl,
      lastCheckedAt: source.lastCheckedAt,
      observedAt: source.observedAt,
      platformId: source.platformId,
      recruitment: source.recruitment,
      sourceId: source.id,
    })),
  };
}
