import type { Context, Hono } from "hono";

import type { OpenPlatformBrowserPurpose } from "@job-boardwalk/contracts";
import { isPlatformId } from "@job-boardwalk/platform-catalog";
import { until } from "@shajara/host";
import type { RiteCoroutine, Scope } from "@shajara/host";

import type { PlatformBrowser } from "#/browser/playwright-platform-browser.js";
import { openPlatformBrowser } from "#/browser/open-platform-browser.js";
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
  runtimeScope: Scope,
): void {
  app.post("/api/profile/facts", (context) =>
    runtimeScope.run(function* setProfileFact() {
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

function registerTargetLocationRoutes(
  app: Hono,
  repository: WorkspaceRepository,
  runtimeScope: Scope,
): void {
  app.post("/api/search-intent/locations", (context) =>
    runtimeScope.run(function* setTargetLocation() {
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
  runtimeScope: Scope,
  platformBrowser: PlatformBrowser,
): void {
  app.get("/api/workspace/overview", (context) =>
    runtimeScope.run(function* getWorkspaceOverview() {
      return context.json(
        yield* readWorkspaceOverview(repository, (platformId) =>
          platformBrowser.hasOpenSession(platformId),
        ),
      );
    }),
  );
}

function registerBrowserRoutes(
  app: Hono,
  runtimeScope: Scope,
  platformBrowser: PlatformBrowser,
): void {
  app.post("/api/platforms/:platformId/browser/open", (context) =>
    runtimeScope.run(function* openPlatformBrowserRequest() {
      const platformId = context.req.param("platformId");
      if (!isPlatformId(platformId)) {
        return context.json({ error: "未知招聘平台" }, badRequestStatus);
      }
      const requestedPurpose = context.req.query("purpose");
      const purpose: OpenPlatformBrowserPurpose = requestedPurpose === "login" ? "login" : "browse";
      try {
        const result = yield* openPlatformBrowser(platformBrowser, platformId, purpose);
        return context.json(result);
      } catch (error) {
        return context.json(
          { error: error instanceof Error ? error.message : "无法打开招聘平台窗口" },
          badRequestStatus,
        );
      }
    }),
  );
  app.get("/api/browser/availability", (context) =>
    context.json(platformBrowser.getAvailability()),
  );
}

export function registerApiRoutes(
  app: Hono,
  repository: WorkspaceRepository,
  runtimeScope: Scope,
  platformBrowser: PlatformBrowser,
): void {
  registerWorkspaceRoutes(app, repository, runtimeScope, platformBrowser);
  registerBrowserRoutes(app, runtimeScope, platformBrowser);
  registerProfileRoutes(app, repository, runtimeScope);
  registerTargetLocationRoutes(app, repository, runtimeScope);
}
