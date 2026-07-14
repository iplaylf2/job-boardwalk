import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolRequest, CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { isPlatformId, platformIds } from "@job-boardwalk/platform-catalog";
import { CanceledError, ScopeError } from "@shajara/host";
import type { RiteCoroutine, RiteFuture, Scope } from "@shajara/host";
import { wait } from "@shajara/host/primitives";

import { observePlatformAccess } from "./platform-access/observe-platform-access.js";
import type { PlaywrightMcpClient } from "./playwright-mcp-client.js";
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
    "读取一次当前招聘平台页面的可见语义，并保存明确的登录状态或访问中断；本次调用不导航或刷新。",
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
  playwrightClientFuture: RiteFuture<PlaywrightMcpClient>;
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
  { browserSessionId, playwrightClientFuture, workspaceService }: BrowserToolHandlerContext,
): RiteCoroutine<CallToolResult> {
  try {
    const playwrightClient = yield* wait(playwrightClientFuture);
    if (request.params.name !== observePlatformAccessToolName) {
      return yield* playwrightClient.callTool(request.params);
    }
    const platformId = request.params.arguments?.["platformId"];
    if (typeof platformId !== "string" || !isPlatformId(platformId)) {
      throw new Error(`未知招聘平台：${String(platformId)}`);
    }
    const assessment = yield* observePlatformAccess(playwrightClient, platformId);
    if (!assessment) {
      return {
        content: [
          {
            text: "当前页面没有足够的可见证据判断是否登录，也未检测到验证要求或访问受阻页面。",
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
    playwrightClientFuture,
    serviceScope,
    workspaceService,
  }: BrowserToolHandlerContext,
): void {
  mcpServer.server.setRequestHandler(ListToolsRequestSchema, () =>
    serviceScope.run(function* listBrowserTools() {
      const playwrightClient = yield* wait(playwrightClientFuture);
      return { tools: [...playwrightClient.tools, platformAccessObservationTool] };
    }),
  );
  mcpServer.server.setRequestHandler(CallToolRequestSchema, (request) =>
    serviceScope.run(() =>
      handleBrowserTool(request, {
        browserSessionId,
        playwrightClientFuture,
        serviceScope,
        workspaceService,
      }),
    ),
  );
}

export function createBrowserSessionMcpServer(
  browserSessionId: string,
  playwrightClientFuture: RiteFuture<PlaywrightMcpClient>,
  workspaceService: WorkspaceServiceClient,
  serviceScope: Scope,
): McpServer {
  const mcpServer = new McpServer(
    { name: "job-boardwalk-browser-session", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "在 Playwright Extension 绑定的可见标签页内操作。页面要求登录、验证或输入凭据，或者下一步将提交申请、发送消息或更改账号状态时，停止浏览器输入，让用户接管同一标签页。只有用户明确返回控制后才能继续。",
    },
  );
  registerBrowserToolHandlers(mcpServer, {
    browserSessionId,
    playwrightClientFuture,
    serviceScope,
    workspaceService,
  });
  return mcpServer;
}
