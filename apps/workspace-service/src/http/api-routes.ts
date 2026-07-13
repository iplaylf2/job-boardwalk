import type { Context, Hono } from "hono";

import { platformAccessEvidenceKinds, platformAccessStates } from "@job-boardwalk/contracts";
import type {
  PlatformAccessAssessment,
  PlatformAccessEvidenceKind,
  PlatformAccessState,
} from "@job-boardwalk/contracts";
import { isPlatformId } from "@job-boardwalk/platform-catalog";
import { until } from "@shajara/host";
import type { RiteCoroutine, Scope } from "@shajara/host";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";
import { readWorkspaceOverview } from "#/workspace/read-workspace-overview.js";

const badRequestStatus = 400;
const createdStatus = 201;

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
  state: PlatformAccessState,
  evidence: PlatformAccessEvidenceKind,
): PlatformAccessAssessment {
  if (state === "authentication-unverified" && evidence === "authentication-cookie") {
    return { evidence, state };
  }
  if (
    state === "authenticated" &&
    (evidence === "authenticated-page" || evidence === "account-identity")
  ) {
    return { evidence, state };
  }
  if (state === "login-required" && evidence === "login-page") {
    return { evidence, state };
  }
  if (state === "verification-required" && evidence === "verification-page") {
    return { evidence, state };
  }
  if (state === "blocked" && evidence === "access-denied-page") {
    return { evidence, state };
  }
  throw new InvalidRequestError("evidence 与 state 不匹配");
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

function invalidRequestResponse(error: unknown, context: Context): Response {
  if (error instanceof InvalidRequestError) {
    return context.json({ error: error.message }, badRequestStatus);
  }
  throw error;
}

function registerProfileRoutes(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.post("/api/profile/facts", (context) =>
    serviceScope.run(function* setProfileFact() {
      try {
        const input = yield* readJsonObject(context);
        repository.setProfileFact({
          confirmed: input["confirmed"] === true,
          key: readRequiredString(input, "key"),
          reason: readRequiredString(input, "reason"),
          source: readRequiredString(input, "source"),
          value: readRequiredString(input, "value"),
        });
        return context.json({ ok: true }, createdStatus);
      } catch (error) {
        return invalidRequestResponse(error, context);
      }
    }),
  );
}

function registerPlatformAccessRoutes(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.post("/api/platform-access/observations", (context) =>
    serviceScope.run(function* recordPlatformAccessObservation() {
      try {
        const input = yield* readJsonObject(context);
        const platformId = readRequiredString(input, "platformId");
        const state = readRequiredString(input, "state");
        const evidence = readRequiredString(input, "evidence");
        if (!isPlatformId(platformId)) {
          throw new InvalidRequestError("platformId 不是受支持的招聘平台");
        }
        if (!isListedValue(state, platformAccessStates)) {
          throw new InvalidRequestError("state 不是受支持的平台访问状态");
        }
        if (!isListedValue(evidence, platformAccessEvidenceKinds)) {
          throw new InvalidRequestError("evidence 不是受支持的观察证据");
        }
        const assessment = readPlatformAccessAssessment(state, evidence);
        const accountDisplayName = readOptionalString(input, "accountDisplayName");
        const observation = repository.recordPlatformAccessObservation({
          browserSessionId: readRequiredString(input, "browserSessionId"),
          observedAt: readObservedAt(input),
          platformId,
          ...assessment,
          ...(accountDisplayName ? { accountDisplayName } : {}),
        });
        return context.json(observation, createdStatus);
      } catch (error) {
        return invalidRequestResponse(error, context);
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
        return invalidRequestResponse(error, context);
      }
    }),
  );
}

function registerWorkspaceRoutes(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.get("/api/workspace/overview", (context) =>
    serviceScope.run(function* getWorkspaceOverview() {
      yield* [];
      return context.json(readWorkspaceOverview(repository));
    }),
  );
}

export function registerApiRoutes(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  registerWorkspaceRoutes(app, repository, serviceScope);
  registerPlatformAccessRoutes(app, repository, serviceScope);
  registerProfileRoutes(app, repository, serviceScope);
  registerTargetLocationRoutes(app, repository, serviceScope);
}
