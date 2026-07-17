import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { CanceledError, InterruptedError, ScopeError } from "@shajara/host";
import type { Scope } from "@shajara/host";
import { platformIds } from "@job-boardwalk/platform-catalog";

import {
  defaultJobPageSize,
  firstJobPage,
  InvalidJobLibraryQueryError,
  maximumJobPageSize,
  parseJobLibraryQuery,
} from "#/job-posting/library-query.js";
import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";
import type { BrowserSessionPresenceTracker } from "#/runtime/browser-session-presence.js";
import { readWorkspaceOverview } from "#/read-model/workspace-overview.js";

const workspaceOverviewUri = "job-boardwalk://workspace/overview";
const jobLibraryUri = "job-boardwalk://jobs";
const workspaceOverviewDescription =
  "读取本机工作区概览：由租约判定的 Browser Session 在线状态、各招聘平台最近一次明确的登录状态记录、尚未解决的访问中断、用户的个人情况，以及带平台推荐页关联和当前选择状态的求职方向。";
const jobLibraryResourceDescription =
  "读取岗位库第一页；其中岗位在研究过程中从招聘平台页面发现，经规范化和跨平台合并，每个来源都带岗位原始链接和发现页面。结果包含分页元数据。";
const jobLibraryToolDescription =
  "读取岗位库；其中岗位在研究过程中从招聘平台页面发现，经规范化和跨平台合并。可分页、搜索或按平台筛选；每个来源都包含岗位原始链接和发现页面，便于回到平台核对。";
const toolNames = {
  readJobLibrary: "read_job_library",
  readWorkspaceOverview: "read_workspace_overview",
} as const;

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
  const message =
    error instanceof InvalidJobLibraryQueryError
      ? error.message
      : "Workspace Service 无法完成工作区读取。";
  return {
    content: [{ text: message, type: "text" }],
    isError: true,
  };
}

function readResourceValue(
  uri: string,
  repository: WorkspaceRepository,
  presenceTracker: BrowserSessionPresenceTracker,
): object | null {
  if (uri === workspaceOverviewUri) {
    return readWorkspaceOverview(repository, presenceTracker);
  }
  if (uri === jobLibraryUri) {
    return repository.listJobPostingPage({
      page: firstJobPage,
      pageSize: defaultJobPageSize,
    });
  }
  return null;
}

function readWorkspaceResource(
  uri: string,
  repository: WorkspaceRepository,
  presenceTracker: BrowserSessionPresenceTracker,
  serviceScope: Scope,
) {
  return serviceScope
    .run(function* readWorkspaceResourceInScope() {
      try {
        yield* [];
        const value = readResourceValue(uri, repository, presenceTracker);
        if (!value) {
          return {
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
          kind: "error" as const,
          message: "Workspace Service 无法完成资源读取。",
        };
      }
    })
    .then((result) => {
      if (result.kind === "error") {
        throw new Error(result.message);
      }
      return result.value;
    });
}

function registerResourceHandlers(
  mcpServer: McpServer,
  repository: WorkspaceRepository,
  presenceTracker: BrowserSessionPresenceTracker,
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
      ],
    }),
  );
  mcpServer.server.setRequestHandler(ReadResourceRequestSchema, (request) =>
    readWorkspaceResource(request.params.uri, repository, presenceTracker, serviceScope),
  );
}

function createToolListResult() {
  return {
    tools: [
      {
        annotations: { readOnlyHint: true },
        description: workspaceOverviewDescription,
        inputSchema: { additionalProperties: false, properties: {}, type: "object" as const },
        name: toolNames.readWorkspaceOverview,
        title: "读取 Job Boardwalk 工作区概览",
      },
      {
        annotations: { readOnlyHint: true },
        description: jobLibraryToolDescription,
        inputSchema: {
          additionalProperties: false,
          properties: {
            page: { minimum: 1, type: "integer" as const },
            pageSize: { maximum: maximumJobPageSize, minimum: 1, type: "integer" as const },
            platformId: { enum: [...platformIds], type: "string" as const },
            query: { type: "string" as const },
          },
          type: "object" as const,
        },
        name: toolNames.readJobLibrary,
        title: "读取 Job Boardwalk 岗位库",
      },
    ],
  };
}

function registerToolHandlers(
  mcpServer: McpServer,
  repository: WorkspaceRepository,
  presenceTracker: BrowserSessionPresenceTracker,
  serviceScope: Scope,
): void {
  mcpServer.server.setRequestHandler(ListToolsRequestSchema, () =>
    Promise.resolve(createToolListResult()),
  );
  mcpServer.server.setRequestHandler(CallToolRequestSchema, (request) => {
    if (request.params.name === toolNames.readWorkspaceOverview) {
      return serviceScope.run(function* readWorkspaceTool() {
        try {
          yield* [];
          const overview = readWorkspaceOverview(repository, presenceTracker);
          return structuredToolResult(overview);
        } catch (error) {
          return toolErrorResult(error);
        }
      });
    }
    if (request.params.name === toolNames.readJobLibrary) {
      return serviceScope.run(function* readJobLibrary() {
        try {
          yield* [];
          return structuredToolResult(
            repository.listJobPostingPage(parseJobLibraryQuery(request.params.arguments ?? {})),
          );
        } catch (error) {
          return toolErrorResult(error);
        }
      });
    }
    return Promise.reject(new Error(`未知 MCP 工具：${request.params.name}`));
  });
}

export function createWorkspaceMcpServer(
  repository: WorkspaceRepository,
  presenceTracker: BrowserSessionPresenceTracker,
  serviceScope: Scope,
): McpServer {
  const mcpServer = new McpServer(
    { name: "job-boardwalk", version: "0.1.0" },
    { capabilities: { resources: {}, tools: {} } },
  );
  registerResourceHandlers(mcpServer, repository, presenceTracker, serviceScope);
  registerToolHandlers(mcpServer, repository, presenceTracker, serviceScope);
  return mcpServer;
}
