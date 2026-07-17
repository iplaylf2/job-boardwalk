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
const workspaceOverviewDescription =
  "本机工作区概览，包含由租约判定的 Browser Session 在线状态、各招聘平台最近一次明确的登录状态记录、尚未解决的访问中断、用户的个人情况和目标城市。";
const toolNames = {
  readWorkspaceOverview: "read_workspace_overview",
} as const;

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
      ],
    }),
  );
  mcpServer.server.setRequestHandler(ReadResourceRequestSchema, (request) => {
    if (request.params.uri !== workspaceOverviewUri) {
      return Promise.reject(new Error(`未知的 Job Boardwalk 资源：${request.params.uri}`));
    }
    return serviceScope.run(function* readWorkspaceResource() {
      yield* [];
      const overview = readWorkspaceOverview(repository, presenceTracker);
      return {
        contents: [
          {
            mimeType: "application/json",
            text: JSON.stringify(overview),
            uri: workspaceOverviewUri,
          },
        ],
      };
    });
  });
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
        return {
          content: [{ text: JSON.stringify(overview), type: "text" as const }],
          structuredContent: { ...overview },
        };
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
