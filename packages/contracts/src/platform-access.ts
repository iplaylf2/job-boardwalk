import { contract } from "./internal/contract.ts";
import { normalizedTimestamp, platformId, positiveInteger } from "./internal/contract-fields.ts";

const authenticatedFromProtectedResource = contract({
  authenticationState: "'authenticated'",
  evidence: "'protected-resource'",
});

const authenticatedFromPage = contract({
  authenticationState: "'authenticated'",
  evidence: "'authenticated-page'",
});

const unauthenticatedFromRedirect = contract({
  authenticationState: "'unauthenticated'",
  evidence: "'login-redirect'",
});

const verificationRequired = contract({
  evidence: "'verification-page'",
  interruption: "'verification-required'",
});

const accessDenied = contract({
  evidence: "'access-denied-page'",
  interruption: "'access-denied'",
});

export const PlatformAccessAssessment = contract.or(
  authenticatedFromProtectedResource,
  authenticatedFromPage,
  unauthenticatedFromRedirect,
  verificationRequired,
  accessDenied,
);
export type PlatformAccessAssessment = typeof PlatformAccessAssessment.infer;

const observationContext = {
  observedAt: normalizedTimestamp,
  platformId,
} as const;

const authenticatedFromProtectedResourceObservation =
  authenticatedFromProtectedResource.merge(observationContext);
const authenticatedFromPageObservation = authenticatedFromPage.merge(observationContext);
const unauthenticatedFromRedirectObservation =
  unauthenticatedFromRedirect.merge(observationContext);
const verificationRequiredObservation = verificationRequired.merge(observationContext);
const accessDeniedObservation = accessDenied.merge(observationContext);

export const PlatformAccessObservation = contract.or(
  authenticatedFromProtectedResourceObservation,
  authenticatedFromPageObservation,
  unauthenticatedFromRedirectObservation,
  verificationRequiredObservation,
  accessDeniedObservation,
);
export type PlatformAccessObservation = typeof PlatformAccessObservation.infer;

const recordedObservation = { id: positiveInteger } as const;

const recordedAuthenticatedFromProtectedResource =
  authenticatedFromProtectedResourceObservation.merge(recordedObservation);
const recordedAuthenticatedFromPage = authenticatedFromPageObservation.merge(recordedObservation);
const recordedUnauthenticatedFromRedirect =
  unauthenticatedFromRedirectObservation.merge(recordedObservation);
const recordedVerificationRequired = verificationRequiredObservation.merge(recordedObservation);
const recordedAccessDenied = accessDeniedObservation.merge(recordedObservation);

export const RecordedPlatformAccessObservation = contract.or(
  recordedAuthenticatedFromProtectedResource,
  recordedAuthenticatedFromPage,
  recordedUnauthenticatedFromRedirect,
  recordedVerificationRequired,
  recordedAccessDenied,
);
export type RecordedPlatformAccessObservation = typeof RecordedPlatformAccessObservation.infer;

export const RecordedPlatformAuthenticationObservation = contract.or(
  recordedAuthenticatedFromProtectedResource,
  recordedAuthenticatedFromPage,
  recordedUnauthenticatedFromRedirect,
);
export type RecordedPlatformAuthenticationObservation =
  typeof RecordedPlatformAuthenticationObservation.infer;

export const RecordedPlatformAccessInterruptionObservation = contract.or(
  recordedVerificationRequired,
  recordedAccessDenied,
);
export type RecordedPlatformAccessInterruptionObservation =
  typeof RecordedPlatformAccessInterruptionObservation.infer;
