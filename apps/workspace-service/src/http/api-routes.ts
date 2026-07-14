import type { Context, Hono } from "hono";

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
import { CanceledError, InterruptedError, ScopeError, until } from "@shajara/host";
import type { RiteCoroutine, Scope } from "@shajara/host";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";
import { readWorkspaceOverview } from "#/read-model/workspace-overview.js";

const badRequestStatus = 400;
const createdStatus = 201;
const internalServerErrorStatus = 500;

class InvalidRequestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new InvalidRequestError(`${key} 必须是非空字符串`);
  }
  return value.trim();
}

function readRequiredBoolean(input: Record<string, unknown>, key: string): boolean {
  const value = input[key];
  if (typeof value !== "boolean") {
    throw new InvalidRequestError(`${key} 必须是布尔值`);
  }
  return value;
}

function readOptionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key] ?? null;
  if (value === null) {
    return;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new InvalidRequestError(`${key} 必须是非空字符串`);
  }
  return value.trim();
}

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

function* readJsonObject(context: Context): RiteCoroutine<Record<string, unknown>> {
  const parsed = yield* until(() =>
    context.req.json().then(
      (value: unknown) => ({ kind: "parsed", value }) as const,
      () => ({ kind: "invalid" }) as const,
    ),
  );
  if (parsed.kind === "invalid") {
    throw new InvalidRequestError("请求正文必须是有效的 JSON");
  }
  const input = parsed.value;
  if (!isRecord(input)) {
    throw new InvalidRequestError("请求正文必须是对象");
  }
  return input;
}

function requestErrorResponse(error: unknown, context: Context): Response {
  if (error instanceof InvalidRequestError) {
    return context.json({ error: error.message }, badRequestStatus);
  }
  if (
    error instanceof CanceledError ||
    error instanceof InterruptedError ||
    error instanceof ScopeError
  ) {
    throw error;
  }
  return context.json({ error: "Workspace Service 内部错误" }, internalServerErrorStatus);
}

function registerProfileFactRoutes(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.post("/api/profile/facts", (context) =>
    serviceScope.run(function* setProfileFact() {
      try {
        const input = yield* readJsonObject(context);
        repository.setProfileFact({
          confirmed: readRequiredBoolean(input, "confirmed"),
          key: readRequiredString(input, "key"),
          reason: readRequiredString(input, "reason"),
          source: readRequiredString(input, "source"),
          value: readRequiredString(input, "value"),
        });
        return context.json({ ok: true }, createdStatus);
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
}

function registerPlatformAccessObservationRoutes(
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

function registerTargetLocationRoutes(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.post("/api/search-intent/locations", (context) =>
    serviceScope.run(function* setTargetLocation() {
      try {
        const input = yield* readJsonObject(context);
        const { priority, requirement } = input;
        if (
          !Number.isInteger(priority) ||
          (requirement !== "required" && requirement !== "preferred")
        ) {
          throw new InvalidRequestError(
            "priority 必须是整数，requirement 必须是 required 或 preferred",
          );
        }
        repository.setTargetLocation({
          city: readRequiredString(input, "city"),
          priority: priority as number,
          reason: readRequiredString(input, "reason"),
          requirement,
        });
        return context.json({ ok: true }, createdStatus);
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
}

function registerWorkspaceOverviewRoutes(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.get("/api/workspace/overview", (context) =>
    serviceScope.run(function* getWorkspaceOverview() {
      try {
        yield* [];
        return context.json(readWorkspaceOverview(repository));
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
}

export function registerApiRoutes(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  registerWorkspaceOverviewRoutes(app, repository, serviceScope);
  registerPlatformAccessObservationRoutes(app, repository, serviceScope);
  registerProfileFactRoutes(app, repository, serviceScope);
  registerTargetLocationRoutes(app, repository, serviceScope);
}
