import type { JobDescriptionObservation, SaveJobObservationResult } from "@job-boardwalk/contracts";

const syntheticSourceId = 71;

export function savedDescription(
  observation: JobDescriptionObservation,
  outcome: SaveJobObservationResult["outcome"] = "unchanged",
  sourceId = syntheticSourceId,
): SaveJobObservationResult {
  return {
    job: {
      createdAt: observation.observedAt,
      details: observation.details,
      id: 1,
      sources: [
        {
          ...observation,
          descriptionCaptureStatus: "captured",
          discoveryUrl: observation.jobUrl,
          engagements: [],
          id: sourceId,
          jobId: 1,
          lastCheckedAt: observation.observedAt,
          summary: observation.description.text,
        },
      ],
      summary: observation.description.text,
      title: observation.title,
      updatedAt: observation.observedAt,
    },
    outcome,
  };
}
