import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolRequest, CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import type {
  PlatformAccessAssessment,
  PlatformAccessObservationInput,
  PlatformAccessOutcome,
} from "@job-boardwalk/contracts";
import { isPlatformId, platformIds } from "@job-boardwalk/platform-catalog";
import type { PlatformId } from "@job-boardwalk/platform-catalog";
import { CanceledError, ScopeError } from "@shajara/host";
import type { RiteCoroutine, Scope } from "@shajara/host";

import { observePlatformAccess } from "./platform-access/observe-platform-access.js";
import { openPlatform } from "./platform-access/open-platform.js";
import { toPlatformAccessOutcome } from "./platform-access/platform-access-outcome.js";
import type { PlaywrightConnectionSupervisor } from "./playwright-connection-supervisor.js";

const observePlatformAccessToolName = "browser_observe_platform_access";
const openPlatformToolName = "browser_open_platform";

export const browserSessionOwnedToolNames = [
  observePlatformAccessToolName,
  openPlatformToolName,
] as const;

const openPlatformTool = {
  annotations: {
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
    readOnlyHint: false,
  },
  description:
    "打开指定招聘平台的入口页，观察一次可见页面，并保存明确的访问结果；不执行登录或验证。",
  inputSchema: {
    additionalProperties: false,
    properties: { platformId: { enum: platformIds, type: "string" } },
    required: ["platformId"],
    type: "object",
  },
  name: openPlatformToolName,
  title: "打开招聘平台并观察访问结果",
} as const satisfies Tool;

const observePlatformAccessTool = {
  annotations: {
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
    readOnlyHint: false,
  },
  description: "观察一次当前招聘平台的可见页面，并保存明确的访问结果；不导航或刷新页面。",
  inputSchema: {
    additionalProperties: false,
    properties: { platformId: { enum: platformIds, type: "string" } },
    required: ["platformId"],
    type: "object",
  },
  name: observePlatformAccessToolName,
  title: "观察当前招聘平台访问结果",
} as const satisfies Tool;

interface BrowserToolHandlerContext {
  browserSessionId: string;
  observationWriter: PlatformAccessObservationWriter;
  playwrightConnection: PlaywrightConnectionSupervisor;
  serviceScope: Scope;
}

export interface PlatformAccessObservationWriter {
  recordPlatformAccessObservation: (
    observation: PlatformAccessObservationInput,
  ) => RiteCoroutine<void>;
}

function readPlatformId(request: CallToolRequest): PlatformId {
  const platformId = request.params.arguments?.["platformId"];
  if (typeof platformId !== "string" || !isPlatformId(platformId)) {
    throw new Error(`未知招聘平台：${String(platformId)}`);
  }
  return platformId;
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

function* recordPlatformAccessAssessment(
  assessment: PlatformAccessAssessment,
  platformId: PlatformId,
  { browserSessionId, observationWriter }: BrowserToolHandlerContext,
): RiteCoroutine<void> {
  yield* observationWriter.recordPlatformAccessObservation({
    ...assessment,
    browserSessionId,
    observedAt: new Date().toISOString(),
    platformId,
  });
}

function* openAndRecordPlatformAccess(
  platformId: PlatformId,
  context: BrowserToolHandlerContext,
): RiteCoroutine<PlatformAccessOutcome> {
  const result = yield* openPlatform(context.playwrightConnection, platformId);
  if ("assessment" in result) {
    yield* recordPlatformAccessAssessment(result.assessment, platformId, context);
  }
  return result;
}

function* observeAndRecordPlatformAccess(
  platformId: PlatformId,
  context: BrowserToolHandlerContext,
): RiteCoroutine<CallToolResult> {
  const outcome = toPlatformAccessOutcome(
    yield* observePlatformAccess(context.playwrightConnection, platformId),
  );
  if ("assessment" in outcome) {
    yield* recordPlatformAccessAssessment(outcome.assessment, platformId, context);
  }
  return { content: [{ text: JSON.stringify(outcome), type: "text" }] };
}

function* handleBrowserTool(
  request: CallToolRequest,
  context: BrowserToolHandlerContext,
): RiteCoroutine<CallToolResult> {
  try {
    if (request.params.name === openPlatformToolName) {
      return {
        content: [
          {
            text: JSON.stringify(
              yield* openAndRecordPlatformAccess(readPlatformId(request), context),
            ),
            type: "text",
          },
        ],
      };
    }
    if (request.params.name === observePlatformAccessToolName) {
      return yield* observeAndRecordPlatformAccess(readPlatformId(request), context);
    }
    return yield* context.playwrightConnection.callTool(request.params);
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
    observationWriter,
    playwrightConnection,
    serviceScope,
  }: BrowserToolHandlerContext,
): void {
  mcpServer.server.setRequestHandler(ListToolsRequestSchema, () =>
    serviceScope.run(function* listBrowserTools() {
      yield* [];
      return {
        tools: [...playwrightConnection.tools, observePlatformAccessTool, openPlatformTool],
      };
    }),
  );
  mcpServer.server.setRequestHandler(CallToolRequestSchema, (request) =>
    serviceScope.run(() =>
      handleBrowserTool(request, {
        browserSessionId,
        observationWriter,
        playwrightConnection,
        serviceScope,
      }),
    ),
  );
}

export function createBrowserSessionMcpServer(
  browserSessionId: string,
  playwrightConnection: PlaywrightConnectionSupervisor,
  observationWriter: PlatformAccessObservationWriter,
  serviceScope: Scope,
): McpServer {
  const mcpServer = new McpServer(
    { name: "job-boardwalk-browser-session", version: "0.1.0" },
    {
      capabilities: { tools: { listChanged: true } },
      instructions:
        "只在 Playwright Extension 绑定的可见标签页内操作。遇到登录、验证或凭据输入，或者下一步将提交申请、发送消息或更改账号状态时，立即停止浏览器输入并让用户接管同一标签页。只有用户明确返回控制后才能继续。",
    },
  );
  registerBrowserToolHandlers(mcpServer, {
    browserSessionId,
    observationWriter,
    playwrightConnection,
    serviceScope,
  });
  return mcpServer;
}
