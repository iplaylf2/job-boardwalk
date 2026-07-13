import { Hono } from "hono";
import type { Context } from "hono";
import { until } from "@shajara/host";
import type { RiteCoroutine, Scope } from "@shajara/host";

import type { WorkspaceRepository } from "./persistence/workspace-repository.js";
import type {
  PlatformBrowser,
  PlatformPagePurpose,
} from "./browser/playwright-platform-browser.js";
import { readWorkspaceOverview } from "./workspace/read-workspace-overview.js";
import { isPlatformId } from "@job-boardwalk/platform-catalog";

const badRequestStatus = 400;
const createdStatus = 201;
const forbiddenStatus = 403;

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

function* readRequestRecord(context: Context): RiteCoroutine<Record<string, unknown>> {
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

function registerLocalOriginGuard(app: Hono): void {
  app.use("/api/*", (context, next) => {
    const origin = context.req.header("origin");
    if (context.req.method !== "GET" && origin) {
      const originUrl = new URL(origin);
      if (originUrl.hostname !== "127.0.0.1" && originUrl.hostname !== "localhost") {
        return Promise.resolve(
          context.json({ error: "拒绝来自非本地页面的状态变更" }, forbiddenStatus),
        );
      }
    }
    return next();
  });
}

function registerProfileRoutes(
  api: Hono,
  repository: WorkspaceRepository,
  runtimeScope: Scope,
): void {
  api.post("/api/profile/facts", (context) =>
    runtimeScope.run(function* setProfileFact() {
      try {
        const input = yield* readRequestRecord(context);
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
  api: Hono,
  repository: WorkspaceRepository,
  runtimeScope: Scope,
): void {
  api.post("/api/search-intent/locations", (context) =>
    runtimeScope.run(function* setTargetLocation() {
      try {
        const input = yield* readRequestRecord(context);
        const { priority, requirement } = input;
        if (
          !Number.isInteger(priority) ||
          (requirement !== "required" && requirement !== "preferred")
        ) {
          throw new InvalidRequestError(
            "priority 必须是整数；requirement 必须是 required 或 preferred",
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

export function createHttpApi(
  repository: WorkspaceRepository,
  runtimeScope: Scope,
  platformBrowser: PlatformBrowser,
): Hono {
  const api = new Hono();

  api.onError((error, context) => context.json({ error: error.message }, badRequestStatus));
  registerLocalOriginGuard(api);
  api.get("/api/workspace/overview", (context) =>
    runtimeScope.run(function* readWorkspace() {
      return context.json(
        yield* readWorkspaceOverview(repository, (platformId) =>
          platformBrowser.hasOpenSession(platformId),
        ),
      );
    }),
  );
  api.post("/api/platforms/:platformId/browser-handoff", async (context) => {
    const platformId = context.req.param("platformId");
    if (!isPlatformId(platformId)) {
      return context.json({ error: "未知招聘平台" }, badRequestStatus);
    }
    const requestedPurpose = context.req.query("purpose");
    const purpose: PlatformPagePurpose = requestedPurpose === "login" ? "login" : "browse";
    await platformBrowser.handoffToUser(platformId, purpose);
    return context.json({
      message: "招聘平台窗口已打开；登录、验证和账号操作由用户在窗口内完成",
      platformId,
      purpose,
      status: "handed-off",
    });
  });
  api.get("/api/browser/availability", (context) =>
    context.json(platformBrowser.getAvailability()),
  );
  registerProfileRoutes(api, repository, runtimeScope);
  registerTargetLocationRoutes(api, repository, runtimeScope);

  return api;
}
