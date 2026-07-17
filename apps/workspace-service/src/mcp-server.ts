import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import type { Scope } from "@shajara/host";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";
import type { BrowserSessionPresenceTracker } from "#/runtime/browser-session-presence.js";
import { readWorkspaceOverview } from "#/read-model/workspace-overview.js";

const workspaceOverviewUri = "job-boardwalk://workspace/overview";
const jobLibraryUri = "job-boardwalk://jobs";
const workspaceOverviewDescription =
  "读取本机工作区概览：由租约判定的 Browser Session 在线状态、各招聘平台最近一次明确的登录状态记录、尚未解决的访问中断、用户的个人情况，以及带平台推荐页关联和当前选择状态的求职方向。";
const jobLibraryDescription =
  "读取从招聘推荐页被动采集、规范化并跨平台合并的岗位库，包含页面事实和各平台原始链接。";
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

function readResourceValue(
  uri: string,
  repository: WorkspaceRepository,
  presenceTracker: BrowserSessionPresenceTracker,
): object | null {
  if (uri === workspaceOverviewUri) {
    return readWorkspaceOverview(repository, presenceTracker);
  }
  if (uri === jobLibraryUri) {
    return { jobs: repository.listJobPostings() };
  }
  return null;
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
          description: jobLibraryDescription,
          mimeType: "application/json",
          name: "job-library",
          title: "Job Boardwalk 岗位库",
          uri: jobLibraryUri,
        },
      ],
    }),
  );
  mcpServer.server.setRequestHandler(ReadResourceRequestSchema, (request) =>
    serviceScope.run(function* readWorkspaceResource() {
      yield* [];
      const value = readResourceValue(request.params.uri, repository, presenceTracker);
      if (!value) {
        throw new Error(`未知的 Job Boardwalk 资源：${request.params.uri}`);
      }
      return {
        contents: [
          {
            mimeType: "application/json",
            text: JSON.stringify(value),
            uri: request.params.uri,
          },
        ],
      };
    }),
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
        description: jobLibraryDescription,
        inputSchema: { additionalProperties: false, properties: {}, type: "object" as const },
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
        yield* [];
        const overview = readWorkspaceOverview(repository, presenceTracker);
        return structuredToolResult(overview);
      });
    }
    if (request.params.name === toolNames.readJobLibrary) {
      return serviceScope.run(function* readJobLibrary() {
        yield* [];
        return structuredToolResult({ jobs: repository.listJobPostings() });
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
