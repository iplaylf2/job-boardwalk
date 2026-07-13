import { type } from "arktype";
import type { Hono } from "hono";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import type { WorkspaceOverview } from "@job-boardwalk/contracts";
import { platformIds } from "@job-boardwalk/platform-catalog";
import { until } from "@shajara/host";
import type { RiteCoroutine, Scope } from "@shajara/host";

import type { PlatformBrowser } from "#/browser/playwright-platform-browser.js";
import { openPlatformBrowser } from "#/browser/open-platform-browser.js";
import type { WorkspaceRepository } from "#/persistence/workspace-repository.js";
import { readWorkspaceOverview } from "#/workspace/read-workspace-overview.js";

const workspaceOverviewUri = "job-boardwalk://workspace/overview";
const toolNames = {
  openPlatformBrowser: "open_platform_browser",
  readBrowserAvailability: "read_browser_availability",
  readWorkspaceOverview: "read_workspace_overview",
} as const;
const openPlatformBrowserInputSchema = type({
  platformId: type.enumerated(...platformIds),
  "purpose?": type.enumerated("browse", "login"),
});

function* readOverview(
  repository: WorkspaceRepository,
  platformBrowser: PlatformBrowser,
): RiteCoroutine<WorkspaceOverview> {
  return yield* readWorkspaceOverview(repository, (platformId) =>
    platformBrowser.hasOpenSession(platformId),
  );
}

function registerResourceHandlers(
  mcpServer: Server,
  repository: WorkspaceRepository,
  runtimeScope: Scope,
  platformBrowser: PlatformBrowser,
): void {
  mcpServer.setRequestHandler(ListResourcesRequestSchema, () =>
    Promise.resolve({
      resources: [
        {
          description: "本地保存的平台访问状态、求职资料和目标地点。",
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
      return Promise.reject(new Error("未知的 Job Boardwalk 资源"));
    }
    return runtimeScope.run(function* readWorkspaceResource() {
      const overview = yield* readOverview(repository, platformBrowser);
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
        description: "读取本地工作区中的平台访问状态、求职资料和目标地点。",
        inputSchema: { additionalProperties: false, properties: {}, type: "object" as const },
        name: toolNames.readWorkspaceOverview,
        title: "读取招聘工作区概览",
      },
      {
        annotations: { readOnlyHint: true },
        description: "检查本地受管 Chromium 是否可用，并返回可执行文件路径。",
        inputSchema: { additionalProperties: false, properties: {}, type: "object" as const },
        name: toolNames.readBrowserAvailability,
        title: "读取浏览器可用性",
      },
      {
        annotations: { destructiveHint: false, idempotentHint: true, readOnlyHint: false },
        description:
          "打开可见的招聘平台窗口并切换到登录或浏览页面。登录、验证和其他账号操作仍由用户完成。",
        inputSchema: openPlatformBrowserInputSchema.toJsonSchema(),
        name: toolNames.openPlatformBrowser,
        title: "打开招聘平台窗口",
      },
    ],
  };
}

function registerToolHandlers(
  mcpServer: Server,
  repository: WorkspaceRepository,
  runtimeScope: Scope,
  platformBrowser: PlatformBrowser,
): void {
  mcpServer.setRequestHandler(ListToolsRequestSchema, () =>
    Promise.resolve(createToolListResult()),
  );
  mcpServer.setRequestHandler(CallToolRequestSchema, (request) => {
    if (request.params.name === toolNames.readWorkspaceOverview) {
      return runtimeScope.run(function* readWorkspaceTool() {
        const overview = yield* readOverview(repository, platformBrowser);
        return {
          content: [{ text: JSON.stringify(overview), type: "text" as const }],
          structuredContent: { ...overview },
        };
      });
    }
    if (request.params.name === toolNames.readBrowserAvailability) {
      const availability = platformBrowser.getAvailability();
      return Promise.resolve({
        content: [{ text: JSON.stringify(availability), type: "text" as const }],
        structuredContent: { ...availability },
      });
    }
    if (request.params.name !== toolNames.openPlatformBrowser) {
      return Promise.reject(new Error(`未知 MCP 工具：${request.params.name}`));
    }
    return callOpenPlatformBrowserTool(request.params.arguments, runtimeScope, platformBrowser);
  });
}

function callOpenPlatformBrowserTool(
  toolArguments: Record<string, unknown> | undefined,
  runtimeScope: Scope,
  platformBrowser: PlatformBrowser,
) {
  const input = openPlatformBrowserInputSchema(toolArguments ?? {});
  if (input instanceof type.errors) {
    return Promise.reject(new TypeError(input.summary));
  }
  return runtimeScope.run(function* openPlatformBrowserTool() {
    const purpose = input.purpose ?? "browse";
    try {
      const result = yield* openPlatformBrowser(platformBrowser, input.platformId, purpose);
      return {
        content: [{ text: result.message, type: "text" as const }],
        structuredContent: { ...result },
      };
    } catch (error) {
      return {
        content: [
          {
            text: error instanceof Error ? error.message : "无法打开招聘平台窗口",
            type: "text" as const,
          },
        ],
        isError: true,
      };
    }
  });
}

function createMcpServer(
  repository: WorkspaceRepository,
  runtimeScope: Scope,
  platformBrowser: PlatformBrowser,
): Server {
  const mcpServer = new Server(
    { name: "job-boardwalk", version: "0.1.0" },
    { capabilities: { resources: {}, tools: {} } },
  );
  registerResourceHandlers(mcpServer, repository, runtimeScope, platformBrowser);
  registerToolHandlers(mcpServer, repository, runtimeScope, platformBrowser);
  return mcpServer;
}

export function registerMcpHttpEndpoint(
  app: Hono,
  repository: WorkspaceRepository,
  runtimeScope: Scope,
  platformBrowser: PlatformBrowser,
): void {
  app.all("/mcp", (context) =>
    runtimeScope.run(function* handleMcpRequest() {
      const mcpServer = createMcpServer(repository, runtimeScope, platformBrowser);
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
