import type { JobCardObservation, JobDescriptionObservation } from "@job-boardwalk/contracts";
import {
  cardObservationFingerprint,
  descriptionObservationFingerprint,
} from "#/job-library/identity.js";
import type { JobPostingSourceRow } from "./schema.js";

export type PreparedJobObservation =
  | {
      cardObservation: JobCardObservation;
      initiatedBy: "agent" | "system" | "user";
      kind: "card";
      observation: JobCardObservation;
      reason: string;
    }
  | {
      cardObservation: JobCardObservation;
      initiatedBy: "agent" | "system" | "user";
      kind: "description";
      observation: JobDescriptionObservation;
      reason: string;
      sourceId?: number;
    };

export type JobSourceObservations = Pick<
  JobPostingSourceRow,
  "cardObservation" | "descriptionObservation"
>;

export function observationFreshness(
  source: JobPostingSourceRow,
  input: PreparedJobObservation,
): "missing" | "newer" | "older" | "same-time" {
  const storedObservation =
    input.kind === "card" ? source.cardObservation : source.descriptionObservation;
  if (!storedObservation) {
    return "missing";
  }
  if (input.observation.observedAt < storedObservation.observedAt) {
    return "older";
  }
  return input.observation.observedAt === storedObservation.observedAt ? "same-time" : "newer";
}

export function observationContentMatches(
  source: JobPostingSourceRow | undefined,
  input: PreparedJobObservation,
): boolean {
  if (input.kind === "card") {
    return Boolean(
      source?.cardObservation &&
      cardObservationFingerprint(source.cardObservation) ===
        cardObservationFingerprint(input.observation),
    );
  }
  return Boolean(
    source?.descriptionObservation &&
    descriptionObservationFingerprint(source.descriptionObservation) ===
      descriptionObservationFingerprint(input.observation),
  );
}

export function nextSourceObservations(
  source: JobPostingSourceRow | undefined,
  input: PreparedJobObservation,
): JobSourceObservations {
  return input.kind === "card"
    ? {
        cardObservation: input.observation,
        descriptionObservation: source?.descriptionObservation ?? null,
      }
    : {
        cardObservation: source?.cardObservation ?? null,
        descriptionObservation: input.observation,
      };
}
