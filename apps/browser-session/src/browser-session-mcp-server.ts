import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolRequest, CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { isPlatformId, platformIds } from "@job-boardwalk/platform-catalog";
import { CanceledError, ScopeError } from "@shajara/host";
import type { RiteCoroutine, Scope } from "@shajara/host";

import { observePlatformAccess } from "./platform-access/observe-platform-access.js";
import type { PlaywrightConnectionSupervisor } from "./playwright-connection-supervisor.js";
import type { WorkspaceServiceClient } from "./workspace-service-client.js";

export const observePlatformAccessToolName = "browser_observe_platform_access";

const platformAccessObservationTool = {
  annotations: {
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
    readOnlyHint: false,
  },
  description:
    "对当前招聘平台页面执行一次语义观察，并保存有明确证据的登录状态或访问中断；本次调用不导航或刷新。",
  inputSchema: {
    additionalProperties: false,
    properties: { platformId: { enum: platformIds, type: "string" } },
    required: ["platformId"],
    type: "object",
  },
  name: observePlatformAccessToolName,
  title: "观察当前招聘平台访问状态",
} as const satisfies Tool;

interface BrowserToolHandlerContext {
  browserSessionId: string;
  playwrightConnection: PlaywrightConnectionSupervisor;
  serviceScope: Scope;
  workspaceService: WorkspaceServiceClient;
}

function toolErrorResult(error: unknown): CallToolResult {
  return {
    content: [
      {
        text: error instanceof Error ? error.message : String(error),
        type: "text",
      },
    ],
    isError: true,
  };
}

function* handleBrowserTool(
  request: CallToolRequest,
  { browserSessionId, playwrightConnection, workspaceService }: BrowserToolHandlerContext,
): RiteCoroutine<CallToolResult> {
  try {
    if (request.params.name !== observePlatformAccessToolName) {
      return yield* playwrightConnection.callTool(request.params);
    }
    const platformId = request.params.arguments?.["platformId"];
    if (typeof platformId !== "string" || !isPlatformId(platformId)) {
      throw new Error(`未知招聘平台：${String(platformId)}`);
    }
    const assessment = yield* observePlatformAccess(playwrightConnection, platformId);
    if (!assessment) {
      return {
        content: [
          {
            text: "当前页面没有足够的可见证据判断登录状态，也未检测到验证要求或访问受阻页面；本次未保存观察结果。",
            type: "text",
          },
        ],
      };
    }
    yield* workspaceService.recordPlatformAccessObservation({
      ...assessment,
      browserSessionId,
      observedAt: new Date().toISOString(),
      platformId,
    });
    return { content: [{ text: JSON.stringify(assessment), type: "text" }] };
  } catch (error) {
    if (error instanceof CanceledError || error instanceof ScopeError) {
      throw error;
    }
    return toolErrorResult(error);
  }
}

function registerBrowserToolHandlers(
  mcpServer: McpServer,
  {
    browserSessionId,
    playwrightConnection,
    serviceScope,
    workspaceService,
  }: BrowserToolHandlerContext,
): void {
  mcpServer.server.setRequestHandler(ListToolsRequestSchema, () =>
    serviceScope.run(function* listBrowserTools() {
      yield* [];
      return {
        tools: [...playwrightConnection.tools, platformAccessObservationTool],
      };
    }),
  );
  mcpServer.server.setRequestHandler(CallToolRequestSchema, (request) =>
    serviceScope.run(() =>
      handleBrowserTool(request, {
        browserSessionId,
        playwrightConnection,
        serviceScope,
        workspaceService,
      }),
    ),
  );
}

export function createBrowserSessionMcpServer(
  browserSessionId: string,
  playwrightConnection: PlaywrightConnectionSupervisor,
  workspaceService: WorkspaceServiceClient,
  serviceScope: Scope,
): McpServer {
  const mcpServer = new McpServer(
    { name: "job-boardwalk-browser-session", version: "0.1.0" },
    {
      capabilities: { tools: { listChanged: true } },
      instructions:
        "在 Playwright Extension 绑定的可见标签页内操作。页面要求登录、验证或输入凭据，或者下一步将提交申请、发送消息或更改账号状态时，停止浏览器输入，让用户接管同一标签页。只有用户明确返回控制后才能继续。",
    },
  );
  registerBrowserToolHandlers(mcpServer, {
    browserSessionId,
    playwrightConnection,
    serviceScope,
    workspaceService,
  });
  return mcpServer;
}
