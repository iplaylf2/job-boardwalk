import type { PlatformId } from "@job-boardwalk/platform-catalog";

export const platformAccessStates = [
  "authentication-unverified",
  "authenticated",
  "login-required",
  "verification-required",
  "blocked",
] as const;

export type PlatformAccessState = (typeof platformAccessStates)[number];

export const platformAccessEvidenceKinds = [
  "authentication-cookie",
  "authenticated-page",
  "account-identity",
  "login-page",
  "verification-page",
  "access-denied-page",
] as const;

export type PlatformAccessEvidenceKind = (typeof platformAccessEvidenceKinds)[number];

export type PlatformAccessAssessment =
  | { evidence: "authentication-cookie"; state: "authentication-unverified" }
  | { evidence: "authenticated-page" | "account-identity"; state: "authenticated" }
  | { evidence: "login-page"; state: "login-required" }
  | { evidence: "verification-page"; state: "verification-required" }
  | { evidence: "access-denied-page"; state: "blocked" };

export type RecordPlatformAccessObservationInput = PlatformAccessAssessment & {
  accountDisplayName?: string;
  browserSessionId: string;
  observedAt: string;
  platformId: PlatformId;
};

export type PlatformAccessObservation = RecordPlatformAccessObservationInput & {
  id: number;
};
