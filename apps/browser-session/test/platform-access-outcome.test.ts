import { expect, test } from "vitest";

import { toPlatformAccessOutcome } from "#/platform-access/platform-access-outcome.js";

test("names each access outcome on one semantic axis", () => {
  expect(
    toPlatformAccessOutcome({
      authenticationState: "authenticated",
      evidence: "account-identity",
    }),
  ).toEqual({
    assessment: { authenticationState: "authenticated", evidence: "account-identity" },
    outcome: "authenticated",
  });
  expect(
    toPlatformAccessOutcome({
      authenticationState: "unauthenticated",
      evidence: "login-page",
    }),
  ).toEqual({
    assessment: { authenticationState: "unauthenticated", evidence: "login-page" },
    outcome: "login-required",
  });
  expect(
    toPlatformAccessOutcome({
      evidence: "verification-page",
      interruption: "verification-required",
    }),
  ).toEqual({
    assessment: {
      evidence: "verification-page",
      interruption: "verification-required",
    },
    outcome: "verification-required",
  });
  expect(
    toPlatformAccessOutcome({
      evidence: "access-denied-page",
      interruption: "access-denied",
    }),
  ).toEqual({
    assessment: { evidence: "access-denied-page", interruption: "access-denied" },
    outcome: "access-denied",
  });
  expect(toPlatformAccessOutcome(null)).toEqual({ outcome: "indeterminate" });
});
