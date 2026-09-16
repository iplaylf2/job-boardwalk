import {
  OperationError,
  SaveResearchReportCommand,
  WorkspaceChangeAttribution,
} from "@job-boardwalk/contracts";
import type { Hono } from "hono";
import type { Scope } from "@shajara/host";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

import {
  InvalidRequestError,
  readPositiveInteger,
  readRequestBody,
  requestErrorResponse,
} from "./request.js";

const createdStatus = 201;

function readIncludeExpired(value: string | undefined): boolean {
  if (typeof value === "string" && value !== "true" && value !== "false") {
    throw new InvalidRequestError("includeExpired 必须为 true 或 false", {
      field: "includeExpired",
    });
  }
  return value === "true";
}

function registerResearchReportReadRoutes(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.get("/api/reports", (context) =>
    serviceScope.run(function* listResearchReports() {
      try {
        yield* [];
        const filter = { includeExpired: readIncludeExpired(context.req.query("includeExpired")) };
        return context.json({ reports: repository.listResearchReports(filter) });
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
  app.get("/api/reports/:id", (context) =>
    serviceScope.run(function* readResearchReport() {
      try {
        yield* [];
        const id = readPositiveInteger(context.req.param("id"), "id");
        const report = repository.readResearchReport(
          id,
          readIncludeExpired(context.req.query("includeExpired")),
        );
        return report
          ? context.json(report)
          : requestErrorResponse(
              new OperationError("not-found", "找不到研究报告", {
                id,
                resource: "research-report",
              }),
              context,
            );
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
}

function registerResearchReportWriteRoutes(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.post("/api/reports", (context) =>
    serviceScope.run(function* createResearchReport() {
      try {
        const input = yield* readRequestBody(context, SaveResearchReportCommand);
        const report = repository.saveResearchReport(input);
        if (!report) {
          throw new Error("创建后无法读取研究报告");
        }
        return context.json(report, createdStatus);
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
  app.put("/api/reports/:id", (context) =>
    serviceScope.run(function* updateResearchReport() {
      try {
        const input = yield* readRequestBody(context, SaveResearchReportCommand);
        const id = readPositiveInteger(context.req.param("id"), "id");
        const report = repository.saveResearchReport({
          ...input,
          id,
        });
        return report
          ? context.json(report)
          : requestErrorResponse(
              new OperationError("not-found", "找不到研究报告", {
                id,
                resource: "research-report",
              }),
              context,
            );
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
}

function registerResearchReportDeleteRoute(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.delete("/api/reports/:id", (context) =>
    serviceScope.run(function* deleteResearchReport() {
      try {
        const input = yield* readRequestBody(context, WorkspaceChangeAttribution);
        const id = readPositiveInteger(context.req.param("id"), "id");
        const deleted = repository.deleteResearchReport({
          ...input,
          id,
        });
        return deleted
          ? context.json({ ok: true })
          : requestErrorResponse(
              new OperationError("not-found", "找不到研究报告", {
                id,
                resource: "research-report",
              }),
              context,
            );
      } catch (error) {
        return requestErrorResponse(error, context);
      }
    }),
  );
}

export function registerResearchReportRoute(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  registerResearchReportReadRoutes(app, repository, serviceScope);
  registerResearchReportWriteRoutes(app, repository, serviceScope);
  registerResearchReportDeleteRoute(app, repository, serviceScope);
}
