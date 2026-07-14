import type { PlatformAccessAssessment, PlatformAccessOutcome } from "@job-boardwalk/contracts";

export function toPlatformAccessOutcome(
  assessment: PlatformAccessAssessment | null,
): PlatformAccessOutcome {
  if (!assessment) {
    return { outcome: "indeterminate" };
  }
  if ("authenticationState" in assessment) {
    if (assessment.authenticationState === "authenticated") {
      return { assessment, outcome: "authenticated" };
    }
    return { assessment, outcome: "login-required" };
  }
  if (assessment.interruption === "verification-required") {
    return { assessment, outcome: "verification-required" };
  }
  return { assessment, outcome: "access-denied" };
}
