import { Hono } from "hono";
import type { Context } from "hono";
import { until } from "@shajara/host";
import type { RiteCoroutine, Scope } from "@shajara/host";

import type { WorkspaceDatabase } from "./database.js";
import { readWorkspaceOverview } from "./workspace-overview.js";

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

function registerProfileRoutes(app: Hono, database: WorkspaceDatabase, serviceScope: Scope): void {
  app.post("/api/profile/facts", (context) =>
    serviceScope.run(function* setProfileFact() {
      try {
        const input = yield* readRequestRecord(context);
        database.setProfileFact({
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
  database: WorkspaceDatabase,
  serviceScope: Scope,
): void {
  app.post("/api/search-intent/locations", (context) =>
    serviceScope.run(function* setTargetLocation() {
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
        database.setTargetLocation({
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

export function createStateServiceApp(database: WorkspaceDatabase, serviceScope: Scope): Hono {
  const app = new Hono();

  app.onError((error, context) => context.json({ error: error.message }, badRequestStatus));
  registerLocalOriginGuard(app);
  app.get("/api/workspace", (context) =>
    serviceScope.run(function* readWorkspace() {
      return context.json(yield* readWorkspaceOverview(database));
    }),
  );
  registerProfileRoutes(app, database, serviceScope);
  registerTargetLocationRoutes(app, database, serviceScope);

  return app;
}
