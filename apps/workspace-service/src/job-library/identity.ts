import { createHash } from "node:crypto";

import type {
  JobCardObservation,
  JobDescriptionObservation,
  JobPostingDescription,
} from "@job-boardwalk/contracts";

type JobIdentityEvidence = Pick<
  JobCardObservation,
  "company" | "externalJobId" | "jobUrl" | "location" | "observedAt" | "platformId" | "title"
>;

function hashJobEvidence(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function cardObservationFingerprint(observation: JobCardObservation): string {
  const { discoveryUrl: _discoveryUrl, jobUrl, observedAt: _observedAt, ...facts } = observation;
  return hashJobEvidence({
    ...facts,
    details: [...new Set(facts.details)].toSorted(),
    jobUrl: jobUrl ? new URL(jobUrl).pathname : null,
  });
}

export function descriptionObservationFingerprint(observation: JobDescriptionObservation): string {
  const { description, observedAt: _observedAt, ...facts } = observation;
  return hashJobEvidence({
    ...facts,
    description: { text: description.text, truncated: description.truncated },
    details: [...new Set(facts.details)].toSorted(),
  });
}

export function jobPostingContentFingerprint<
  Value extends { description?: JobPostingDescription | null },
>(value: Value): string {
  const { description, ...facts } = value;
  return hashJobEvidence({
    ...facts,
    description: description ? { text: description.text, truncated: description.truncated } : null,
  });
}

export function jobPostingStateFingerprint(value: unknown): string {
  return hashJobEvidence(value);
}

export function normalizedIdentityPart(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replaceAll(/[^\p{L}\p{N}]+/gu, "");
}

function completeJobPostingIdentityKey(observation: {
  company?: string | null;
  location?: string | null;
  title: string;
}): string | null {
  if (!observation.company || !observation.location) {
    return null;
  }
  return hashJobEvidence([
    normalizedIdentityPart(observation.company),
    normalizedIdentityPart(observation.title),
    normalizedIdentityPart(observation.location),
  ]);
}

export function jobPostingSourceIdentityKey(observation: JobIdentityEvidence): string {
  if (observation.externalJobId) {
    return hashJobEvidence([observation.platformId, observation.externalJobId]);
  }
  if (observation.jobUrl) {
    return hashJobEvidence([observation.platformId, new URL(observation.jobUrl).pathname]);
  }
  return hashJobEvidence([
    observation.platformId,
    normalizedIdentityPart(observation.company ?? ""),
    normalizedIdentityPart(observation.title),
    normalizedIdentityPart(observation.location ?? ""),
  ]);
}

export function jobPostingIdentityKey(observation: JobIdentityEvidence): string {
  return completeJobPostingIdentityKey(observation) ?? jobPostingSourceIdentityKey(observation);
}

export function jobPostingIdentityKeyFromSources(observations: JobIdentityEvidence[]): string {
  const [firstObservation, ...remainingObservations] = observations;
  if (!firstObservation) {
    throw new Error("岗位规范化至少需要一个平台来源。");
  }
  let latest = firstObservation;
  for (const observation of remainingObservations) {
    if (observation.observedAt > latest.observedAt) {
      latest = observation;
    }
  }
  return jobPostingIdentityKey(latest);
}
