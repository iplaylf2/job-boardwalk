import type {
  JobCardObservation,
  JobDescriptionObservation,
  JobPostingDescription,
} from "@job-boardwalk/contracts";
import type { JobPostingRow } from "./schema.js";

type JobSourceEvidence = JobCardObservation & {
  description?: JobPostingDescription;
};

export function projectDescriptionAsCardObservation(
  observation: JobDescriptionObservation,
): JobCardObservation {
  return {
    observedAt: observation.observedAt,
    ...(observation.company ? { company: observation.company } : {}),
    details: observation.details,
    discoveryUrl: observation.jobUrl,
    ...(observation.educationRequirement
      ? { educationRequirement: observation.educationRequirement }
      : {}),
    ...(observation.experienceRequirement
      ? { experienceRequirement: observation.experienceRequirement }
      : {}),
    ...(observation.externalJobId ? { externalJobId: observation.externalJobId } : {}),
    jobUrl: observation.jobUrl,
    ...(observation.location ? { location: observation.location } : {}),
    platformId: observation.platformId,
    ...(observation.salaryText ? { salaryText: observation.salaryText } : {}),
    summary: observation.description.text.replaceAll(/\s+/gu, " ").trim(),
    title: observation.title,
  };
}

export function jobSourceEvidence(
  cardObservation: JobCardObservation | null,
  descriptionObservation: JobDescriptionObservation | null,
): JobSourceEvidence {
  if (!descriptionObservation) {
    if (!cardObservation) {
      throw new Error("岗位来源至少需要卡片或详情证据。");
    }
    return cardObservation;
  }
  const descriptionEvidence = projectDescriptionAsCardObservation(descriptionObservation);
  if (!cardObservation) {
    return { ...descriptionEvidence, description: descriptionObservation.description };
  }
  return {
    ...cardObservation,
    ...descriptionEvidence,
    description: descriptionObservation.description,
    details: [
      ...new Set([...cardObservation.details, ...descriptionObservation.details]),
    ].toSorted(),
    discoveryUrl: cardObservation.discoveryUrl,
    observedAt:
      descriptionObservation.observedAt > cardObservation.observedAt
        ? descriptionObservation.observedAt
        : cardObservation.observedAt,
    summary: cardObservation.summary,
  };
}

export function canonicalJobPostingValues(
  observations: JobSourceEvidence[],
): CanonicalJobPostingValues {
  const [firstObservation, ...remainingObservations] = observations;
  if (!firstObservation) {
    throw new Error("岗位规范化至少需要一个平台来源。");
  }
  let latest = firstObservation;
  let latestDescription = firstObservation.description;
  for (const observation of remainingObservations) {
    if (observation.observedAt > latest.observedAt) {
      latest = observation;
    }
    if (
      observation.description &&
      (!latestDescription || observation.description.capturedAt > latestDescription.capturedAt)
    ) {
      latestDescription = observation.description;
    }
  }
  return {
    company: latest.company ?? null,
    description: latestDescription ?? null,
    details: [...new Set(observations.flatMap(({ details }) => details))].toSorted(),
    educationRequirement: latest.educationRequirement ?? null,
    experienceRequirement: latest.experienceRequirement ?? null,
    location: latest.location ?? null,
    summary: latest.summary,
    title: latest.title,
  };
}

type CanonicalJobPostingValues = Pick<
  JobPostingRow,
  | "company"
  | "description"
  | "details"
  | "educationRequirement"
  | "experienceRequirement"
  | "location"
  | "summary"
  | "title"
>;

export function storedCanonicalJobPostingValues(job: JobPostingRow): CanonicalJobPostingValues {
  return {
    company: job.company,
    description: job.description,
    details: job.details,
    educationRequirement: job.educationRequirement,
    experienceRequirement: job.experienceRequirement,
    location: job.location,
    summary: job.summary,
    title: job.title,
  };
}
