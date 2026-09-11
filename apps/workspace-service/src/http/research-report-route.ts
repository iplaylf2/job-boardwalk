import { type } from "arktype";
import type { Hono } from "hono";
import {
  ResearchReportFilter,
  SaveResearchReportCommand,
  WorkspaceChangeAttribution,
} from "@job-boardwalk/contracts";
import type { Scope } from "@shajara/host";

import { isResearchReportValidationError } from "#/persistence/research-report-repository.js";
import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";

import {
  InvalidRequestError,
  readPositiveInteger,
  readRequestBody,
  requestErrorResponse,
} from "./request.js";

const createdStatus = 201;
const notFoundStatus = 404;

function readIncludeExpired(value: string | undefined): boolean {
  if (typeof value === "string" && value !== "true" && value !== "false") {
    throw new InvalidRequestError("includeExpired 必须为 true 或 false");
  }
  return value === "true";
}

function readReportFilter(query: Record<string, string>): ResearchReportFilter {
  const { sourceId } = query;
  const { disposition } = query;
  const parseFilter = ResearchReportFilter;
  const filter = parseFilter({
    ...(typeof sourceId === "string"
      ? { sourceId: readPositiveInteger(sourceId, "sourceId") }
      : {}),
    ...(typeof disposition === "string" ? { disposition } : {}),
    includeExpired: readIncludeExpired(query["includeExpired"]),
  });
  if (filter instanceof type.errors) {
    throw new InvalidRequestError(filter.summary);
  }
  return filter;
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
        const filter = readReportFilter(context.req.query());
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
        const report = repository.readResearchReport(
          readPositiveInteger(context.req.param("id"), "id"),
          readIncludeExpired(context.req.query("includeExpired")),
        );
        return report
          ? context.json(report)
          : context.json({ error: "找不到研究报告" }, notFoundStatus);
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
        return requestErrorResponse(
          isResearchReportValidationError(error) ? new InvalidRequestError(error.message) : error,
          context,
        );
      }
    }),
  );
  app.put("/api/reports/:id", (context) =>
    serviceScope.run(function* updateResearchReport() {
      try {
        const input = yield* readRequestBody(context, SaveResearchReportCommand);
        const report = repository.saveResearchReport({
          ...input,
          id: readPositiveInteger(context.req.param("id"), "id"),
        });
        return report
          ? context.json(report)
          : context.json({ error: "找不到研究报告" }, notFoundStatus);
      } catch (error) {
        return requestErrorResponse(
          isResearchReportValidationError(error) ? new InvalidRequestError(error.message) : error,
          context,
        );
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
        const deleted = repository.deleteResearchReport({
          ...input,
          id: readPositiveInteger(context.req.param("id"), "id"),
        });
        return deleted
          ? context.json({ ok: true })
          : context.json({ error: "找不到研究报告" }, notFoundStatus);
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
