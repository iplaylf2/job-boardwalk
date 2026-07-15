import type { Hono } from "hono";
import {
  platformAccessEvidenceKinds,
  platformAccessInterruptions,
  platformAuthenticationStates,
} from "@job-boardwalk/contracts";
import type {
  PlatformAccessAssessment,
  PlatformAccessEvidenceKind,
  PlatformAccessInterruption,
  PlatformAuthenticationState,
} from "@job-boardwalk/contracts";
import { isPlatformId } from "@job-boardwalk/platform-catalog";
import type { Scope } from "@shajara/host";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

import {
  InvalidRequestError,
  readJsonObject,
  readOptionalString,
  readRequiredString,
  requestErrorResponse,
} from "./request.js";

const createdStatus = 201;

function readObservedAt(input: Record<string, unknown>): string {
  const value = readRequiredString(input, "observedAt");
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new InvalidRequestError("observedAt 必须是有效时间");
  }
  return timestamp.toISOString();
}

function isListedValue<const Value extends string>(
  value: string,
  values: readonly Value[],
): value is Value {
  return values.some((candidate) => candidate === value);
}

function readPlatformAccessAssessment(
  authenticationState: PlatformAuthenticationState | null,
  interruption: PlatformAccessInterruption | null,
  evidence: PlatformAccessEvidenceKind,
): PlatformAccessAssessment {
  if (
    authenticationState === "authenticated" &&
    interruption === null &&
    evidence === "account-identity"
  ) {
    return { authenticationState, evidence };
  }
  if (
    authenticationState === "unauthenticated" &&
    interruption === null &&
    evidence === "login-page"
  ) {
    return { authenticationState, evidence };
  }
  if (
    authenticationState === null &&
    interruption === "verification-required" &&
    evidence === "verification-page"
  ) {
    return { evidence, interruption };
  }
  if (
    authenticationState === null &&
    interruption === "access-denied" &&
    evidence === "access-denied-page"
  ) {
    return { evidence, interruption };
  }
  throw new InvalidRequestError("authenticationState、interruption 与 evidence 的组合无效");
}

export function registerPlatformAccessObservationRoute(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.post("/api/platform-access/observations", (context) =>
    serviceScope.run(function* recordPlatformAccessObservation() {
      try {
        const input = yield* readJsonObject(context);
        const platformId = readRequiredString(input, "platformId");
        const evidence = readRequiredString(input, "evidence");
        const authenticationState = readOptionalString(input, "authenticationState") ?? null;
        const interruption = readOptionalString(input, "interruption") ?? null;
        if (!isPlatformId(platformId)) {
          throw new InvalidRequestError("platformId 不是受支持的招聘平台");
        }
        if (
          authenticationState !== null &&
          !isListedValue(authenticationState, platformAuthenticationStates)
        ) {
          throw new InvalidRequestError("authenticationState 不是受支持的登录状态");
        }
        if (interruption !== null && !isListedValue(interruption, platformAccessInterruptions)) {
          throw new InvalidRequestError("interruption 不是受支持的访问中断");
        }
        if (!isListedValue(evidence, platformAccessEvidenceKinds)) {
          throw new InvalidRequestError("evidence 不是受支持的观察证据");
        }
        const assessment = readPlatformAccessAssessment(
          authenticationState,
          interruption,
          evidence,
        );
        const accountDisplayName = readOptionalString(input, "accountDisplayName");
        const observation = repository.recordPlatformAccessObservation({
          observedAt: readObservedAt(input),
          platformId,
          ...assessment,
          ...(accountDisplayName ? { accountDisplayName } : {}),
        });
        return context.json(observation, createdStatus);
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
}
