import type { PlatformId } from "@job-boardwalk/platform-catalog";

export const platformAuthenticationStates = ["authenticated", "unauthenticated"] as const;

export type PlatformAuthenticationState = (typeof platformAuthenticationStates)[number];

export const platformAccessInterruptions = ["verification-required", "access-denied"] as const;

export type PlatformAccessInterruption = (typeof platformAccessInterruptions)[number];

export const platformAccessEvidenceKinds = [
  "protected-resource",
  "authenticated-page",
  "login-redirect",
  "verification-page",
  "access-denied-page",
] as const;

export type PlatformAccessEvidenceKind = (typeof platformAccessEvidenceKinds)[number];

export type PlatformAccessAssessment =
  | {
      authenticationState: "authenticated";
      evidence: "protected-resource" | "authenticated-page";
    }
  | { authenticationState: "unauthenticated"; evidence: "login-redirect" }
  | { evidence: "verification-page"; interruption: "verification-required" }
  | { evidence: "access-denied-page"; interruption: "access-denied" };

interface PlatformAccessObservationContext {
  observedAt: string;
  platformId: PlatformId;
}

export type PlatformAccessObservation = PlatformAccessAssessment & PlatformAccessObservationContext;

export type RecordedPlatformAccessObservation = PlatformAccessObservation & {
  id: number;
};

export type RecordedPlatformAuthenticationObservation = Extract<
  RecordedPlatformAccessObservation,
  { authenticationState: PlatformAuthenticationState }
>;

export type RecordedPlatformAccessInterruptionObservation = Extract<
  RecordedPlatformAccessObservation,
  { interruption: PlatformAccessInterruption }
>;
