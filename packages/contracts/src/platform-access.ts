import type { PlatformId } from "@job-boardwalk/platform-catalog";

export const platformAuthenticationStates = ["authenticated", "unauthenticated"] as const;

export type PlatformAuthenticationState = (typeof platformAuthenticationStates)[number];

export const platformAccessInterruptions = ["verification-required", "access-denied"] as const;

export type PlatformAccessInterruption = (typeof platformAccessInterruptions)[number];

export const platformAccessEvidenceKinds = [
  "account-identity",
  "login-page",
  "verification-page",
  "access-denied-page",
] as const;

export type PlatformAccessEvidenceKind = (typeof platformAccessEvidenceKinds)[number];

export type PlatformAccessAssessment =
  | {
      authenticationState: "authenticated";
      evidence: "account-identity";
    }
  | { authenticationState: "unauthenticated"; evidence: "login-page" }
  | { evidence: "verification-page"; interruption: "verification-required" }
  | { evidence: "access-denied-page"; interruption: "access-denied" };

type AuthenticatedPlatformAccessAssessment = Extract<
  PlatformAccessAssessment,
  { authenticationState: "authenticated" }
>;

type UnauthenticatedPlatformAccessAssessment = Extract<
  PlatformAccessAssessment,
  { authenticationState: "unauthenticated" }
>;

type VerificationPlatformAccessAssessment = Extract<
  PlatformAccessAssessment,
  { interruption: "verification-required" }
>;

type DeniedPlatformAccessAssessment = Extract<
  PlatformAccessAssessment,
  { interruption: "access-denied" }
>;

export type PlatformAccessOutcome =
  | { assessment: AuthenticatedPlatformAccessAssessment; outcome: "authenticated" }
  | {
      assessment: UnauthenticatedPlatformAccessAssessment;
      outcome: "login-required";
    }
  | {
      assessment: VerificationPlatformAccessAssessment;
      outcome: "verification-required";
    }
  | { assessment: DeniedPlatformAccessAssessment; outcome: "access-denied" }
  | { outcome: "indeterminate" };

interface PlatformAccessObservationCommon {
  accountDisplayName?: string;
  browserSessionId: string;
  observedAt: string;
  platformId: PlatformId;
}

export type PlatformAccessObservationInput = PlatformAccessAssessment &
  PlatformAccessObservationCommon;

export type PlatformAccessObservation = PlatformAccessObservationInput & {
  id: number;
};

export type PlatformAuthenticationObservation = Extract<
  PlatformAccessObservation,
  { authenticationState: PlatformAuthenticationState }
>;

export type PlatformAccessInterruptionObservation = Extract<
  PlatformAccessObservation,
  { interruption: PlatformAccessInterruption }
>;
