import {
  McpError,
  ErrorCode,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { operationErrorResponse } from "@job-boardwalk/contracts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { CanceledError, InterruptedError, ScopeError } from "@shajara/host";
import type { Scope } from "@shajara/host";
import { defaultJobPageSize, firstJobPage } from "#/job-library/query.js";
import { workspaceToolRegistry, workspaceOverviewDescription } from "#/mcp/workspace-tools.js";
import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";
import { readWorkspaceOverview } from "#/read-model/workspace-overview.js";

const workspaceOverviewUri = "job-boardwalk://workspace/overview";
const jobLibraryUri = "job-boardwalk://jobs";
const researchReportsUri = "job-boardwalk://reports";
const jobLibraryResourceDescription =
  "读取岗位库第一页、职位描述覆盖统计和分页信息。岗位经规范化并在证据充分时跨平台合并；结果保留各平台来源、原始链接、跟进记录、已采集职位描述及可选的 recruitment 观察。";
const researchReportsResourceDescription =
  "读取未过期研究报告目录，包含标题、撰写状态和时间。查阅过期报告时，使用 list_research_reports。";
function structuredToolResult(value: object) {
  return {
    content: [{ text: JSON.stringify(value), type: "text" as const }],
    structuredContent: { ...value },
  };
}

function toolErrorResult(error: unknown): CallToolResult {
  if (
    error instanceof CanceledError ||
    error instanceof InterruptedError ||
    error instanceof ScopeError
  ) {
    throw error;
  }
  const failure = operationErrorResponse(error);
  return {
    content: [{ text: JSON.stringify(failure), type: "text" }],
    isError: true,
    structuredContent: { ...failure },
  };
}

function readResourceValue(uri: string, repository: WorkspaceRepository): object | null {
  if (uri === workspaceOverviewUri) {
    return readWorkspaceOverview(repository);
  }
  if (uri === jobLibraryUri) {
    return repository.listJobPostingPage({
      page: firstJobPage,
      pageSize: defaultJobPageSize,
    });
  }
  if (uri === researchReportsUri) {
    return { reports: repository.listResearchReports() };
  }
  return null;
}

function readWorkspaceResource(uri: string, repository: WorkspaceRepository, serviceScope: Scope) {
  return (
    serviceScope
      // eslint-disable-next-line require-yield -- Synchronous resource reads participate in service-scope admission and error containment.
      .run(function* readWorkspaceResourceInScope() {
        try {
          const value = readResourceValue(uri, repository);
          if (!value) {
            return {
              code: -32_002,
              data: { uri },
              kind: "error" as const,
              message: `未知的 Job Boardwalk 资源：${uri}`,
            };
          }
          return {
            kind: "value" as const,
            value: {
              contents: [{ mimeType: "application/json", text: JSON.stringify(value), uri }],
            },
          };
        } catch (error) {
          if (
            error instanceof CanceledError ||
            error instanceof InterruptedError ||
            error instanceof ScopeError
          ) {
            throw error;
          }
          return {
            code: ErrorCode.InternalError,
            data: operationErrorResponse(error),
            kind: "error" as const,
            message: "Workspace Service 无法完成资源读取。",
          };
        }
      })
      .then((result) => {
        if (result.kind === "error") {
          throw new McpError(result.code, result.message, result.data);
        }
        return result.value;
      })
  );
}

function registerResourceHandlers(
  mcpServer: McpServer,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  mcpServer.server.setRequestHandler(ListResourcesRequestSchema, () =>
    Promise.resolve({
      resources: [
        {
          description: workspaceOverviewDescription,
          mimeType: "application/json",
          name: "workspace-overview",
          title: "Job Boardwalk 工作区概览",
          uri: workspaceOverviewUri,
        },
        {
          description: jobLibraryResourceDescription,
          mimeType: "application/json",
          name: "job-library",
          title: "Job Boardwalk 岗位库",
          uri: jobLibraryUri,
        },
        {
          description: researchReportsResourceDescription,
          mimeType: "application/json",
          name: "research-reports",
          title: "Job Boardwalk 研究报告",
          uri: researchReportsUri,
        },
      ],
    }),
  );
  mcpServer.server.setRequestHandler(ReadResourceRequestSchema, (request) =>
    readWorkspaceResource(request.params.uri, repository, serviceScope),
  );
}

function registerToolHandlers(
  mcpServer: McpServer,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  mcpServer.server.setRequestHandler(ListToolsRequestSchema, () =>
    Promise.resolve({
      tools: [...workspaceToolRegistry.values()].map(({ execute: _execute, ...tool }) => tool),
    }),
  );
  mcpServer.server.setRequestHandler(CallToolRequestSchema, (request) => {
    const tool = workspaceToolRegistry.get(request.params.name);
    if (!tool) {
      return Promise.reject(
        new McpError(ErrorCode.InvalidParams, "未知 MCP 工具", { tool: request.params.name }),
      );
    }
    // eslint-disable-next-line require-yield -- Synchronous repository work still enters the service scope; it has no asynchronous step to yield.
    return serviceScope.run(function* executeWorkspaceTool() {
      try {
        return structuredToolResult(tool.execute(repository, request.params.arguments ?? {}));
      } catch (error) {
        return toolErrorResult(error);
      }
    });
  });
}

export function createWorkspaceMcpServer(
  repository: WorkspaceRepository,
  serviceScope: Scope,
): McpServer {
  const mcpServer = new McpServer(
    { name: "job-boardwalk", version: "0.1.0" },
    { capabilities: { resources: {}, tools: {} } },
  );
  registerResourceHandlers(mcpServer, repository, serviceScope);
  registerToolHandlers(mcpServer, repository, serviceScope);
  return mcpServer;
}
