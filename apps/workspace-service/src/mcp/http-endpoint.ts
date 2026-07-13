import type { Hono } from "hono";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { until } from "@shajara/host";
import type { Scope } from "@shajara/host";

import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";
import { readWorkspaceOverview } from "#/workspace/read-workspace-overview.js";

const workspaceOverviewUri = "job-boardwalk://workspace/overview";
const toolNames = {
  readWorkspaceOverview: "read_workspace_overview",
} as const;

function registerResourceHandlers(
  mcpServer: Server,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  mcpServer.setRequestHandler(ListResourcesRequestSchema, () =>
    Promise.resolve({
      resources: [
        {
          description: "本机工作区中每个平台的最近一次访问观察、求职资料和目标城市。",
          mimeType: "application/json",
          name: "workspace-overview",
          title: "Job Boardwalk 工作区概览",
          uri: workspaceOverviewUri,
        },
      ],
    }),
  );
  mcpServer.setRequestHandler(ReadResourceRequestSchema, (request) => {
    if (request.params.uri !== workspaceOverviewUri) {
      return Promise.reject(new Error(`未知的 Job Boardwalk 资源：${request.params.uri}`));
    }
    return serviceScope.run(function* readWorkspaceResource() {
      yield* [];
      const overview = readWorkspaceOverview(repository);
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
        description: "读取本机工作区中每个平台的最近一次访问观察、求职资料和目标城市。",
        inputSchema: { additionalProperties: false, properties: {}, type: "object" as const },
        name: toolNames.readWorkspaceOverview,
        title: "读取 Job Boardwalk 工作区概览",
      },
    ],
  };
}

function registerToolHandlers(
  mcpServer: Server,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  mcpServer.setRequestHandler(ListToolsRequestSchema, () =>
    Promise.resolve(createToolListResult()),
  );
  mcpServer.setRequestHandler(CallToolRequestSchema, (request) => {
    if (request.params.name === toolNames.readWorkspaceOverview) {
      return serviceScope.run(function* readWorkspaceTool() {
        yield* [];
        const overview = readWorkspaceOverview(repository);
        return {
          content: [{ text: JSON.stringify(overview), type: "text" as const }],
          structuredContent: { ...overview },
        };
      });
    }
    return Promise.reject(new Error(`未知 MCP 工具：${request.params.name}`));
  });
}

function createMcpServer(repository: WorkspaceRepository, serviceScope: Scope): Server {
  const mcpServer = new Server(
    { name: "job-boardwalk", version: "0.1.0" },
    { capabilities: { resources: {}, tools: {} } },
  );
  registerResourceHandlers(mcpServer, repository, serviceScope);
  registerToolHandlers(mcpServer, repository, serviceScope);
  return mcpServer;
}

export function registerMcpHttpEndpoint(
  app: Hono,
  repository: WorkspaceRepository,
  serviceScope: Scope,
): void {
  app.all("/mcp", (context) =>
    serviceScope.run(function* handleMcpRequest() {
      const mcpServer = createMcpServer(repository, serviceScope);
      const httpTransport = new WebStandardStreamableHTTPServerTransport({
        enableJsonResponse: true,
      });
      yield* until(() => mcpServer.connect(httpTransport));
      try {
        return yield* until(() => httpTransport.handleRequest(context.req.raw));
      } finally {
        yield* until(() => mcpServer.close());
      }
    }),
  );
}
