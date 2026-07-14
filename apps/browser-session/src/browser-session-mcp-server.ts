import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { isPlatformId, platformIds } from "@job-boardwalk/platform-catalog";
import type { Scope } from "@shajara/host";

import { observePlatformAccess } from "./platform-access/observe-platform-access.js";
import type { PlaywrightMcpClient } from "./playwright-mcp-client.js";
import type { WorkspaceServiceClient } from "./workspace-service-client.js";

const observePlatformAccessToolName = "browser_observe_platform_access";

const platformAccessObservationTool = {
  annotations: { readOnlyHint: true },
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
  playwrightClient: PlaywrightMcpClient;
  serviceScope: Scope;
  workspaceService: WorkspaceServiceClient;
}

function registerBrowserToolHandlers(
  mcpServer: McpServer,
  { browserSessionId, playwrightClient, serviceScope, workspaceService }: BrowserToolHandlerContext,
): void {
  mcpServer.server.setRequestHandler(ListToolsRequestSchema, () =>
    serviceScope.run(function* listBrowserTools() {
      yield* [];
      return { tools: [...playwrightClient.tools, platformAccessObservationTool] };
    }),
  );
  mcpServer.server.setRequestHandler(CallToolRequestSchema, (request) =>
    serviceScope.run(function* handleBrowserTool() {
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
              text: "当前页面没有足够的可见证据确认登录状态，也没有检测到需要用户处理的页面。",
              type: "text" as const,
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
      return { content: [{ text: JSON.stringify(assessment), type: "text" as const }] };
    }),
  );
}

export function createBrowserSessionMcpServer(
  browserSessionId: string,
  playwrightClient: PlaywrightMcpClient,
  workspaceService: WorkspaceServiceClient,
  serviceScope: Scope,
): McpServer {
  const mcpServer = new McpServer(
    { name: "job-boardwalk-browser-session", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "在宿主机中由 Playwright Extension 绑定的可见标签页内操作。遇到登录、验证或账号操作时停止输入并交还用户。",
    },
  );
  registerBrowserToolHandlers(mcpServer, {
    browserSessionId,
    playwrightClient,
    serviceScope,
    workspaceService,
  });
  return mcpServer;
}
