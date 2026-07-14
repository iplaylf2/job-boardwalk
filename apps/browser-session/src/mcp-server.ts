import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolRequest, CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { CanceledError, ScopeError } from "@shajara/host";
import type { RiteCoroutine, Scope } from "@shajara/host";

import type { BrowserToolBackend } from "#/browser/tool-backend.js";

const minimumWaitMilliseconds = 0;
const jsonIndentationSpaces = 2;

const browserTools = [
  {
    annotations: { idempotentHint: true, openWorldHint: false, readOnlyHint: true },
    description: "查看 Browser Session 与用户浏览器的 Patchright CDP 连接状态。",
    inputSchema: { properties: {}, type: "object" },
    name: "browser_session_status",
  },
  {
    annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
    description: "列出、打开或激活当前 BOSS HTTPS 研究范围内的标签页。",
    inputSchema: {
      properties: {
        action: { enum: ["list", "open", "activate"], type: "string" },
        tabId: { type: "number" },
        url: { type: "string" },
      },
      required: ["action"],
      type: "object",
    },
    name: "browser_tabs",
  },
  {
    annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
    description: "将范围内的标签页导航到 BOSS HTTPS URL；这不授权任何账号操作。",
    inputSchema: {
      properties: { tabId: { type: "number" }, url: { type: "string" } },
      required: ["url"],
      type: "object",
    },
    name: "browser_navigate",
  },
  {
    annotations: { idempotentHint: true, openWorldHint: true, readOnlyHint: true },
    description:
      "读取有界的可见文本和通用交互元素，并返回短期有效的元素引用。truncated 表示内容被裁剪；快照不包含表单当前值和密码框。",
    inputSchema: {
      properties: {
        maxTextCharacters: { maximum: 40_000, minimum: 1000, type: "number" },
        tabId: { type: "number" },
      },
      type: "object",
    },
    name: "browser_snapshot",
  },
  {
    annotations: { destructiveHint: true, openWorldHint: true, readOnlyHint: false },
    description: "点击最近一次快照中的元素引用。不得用于登录、验证、投递、发送消息或修改账号。",
    inputSchema: {
      properties: { ref: { type: "string" } },
      required: ["ref"],
      type: "object",
    },
    name: "browser_click",
  },
  {
    annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
    description: "填写最近一次快照中的文本控件，仅用于搜索等研究操作；凭据和验证内容由用户填写。",
    inputSchema: {
      properties: { ref: { type: "string" }, value: { type: "string" } },
      required: ["ref", "value"],
      type: "object",
    },
    name: "browser_fill",
  },
  {
    annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
    description: "在最近一次快照的控件中选择值，仅用于筛选等研究操作；账号变更由用户操作。",
    inputSchema: {
      properties: { ref: { type: "string" }, value: { type: "string" } },
      required: ["ref", "value"],
      type: "object",
    },
    name: "browser_select",
  },
  {
    annotations: { idempotentHint: false, openWorldHint: true, readOnlyHint: true },
    description: "在范围内的 BOSS 标签页滚动最多 5000 像素，或滚动到指定元素。",
    inputSchema: {
      properties: {
        deltaY: { maximum: 5000, minimum: -5000, type: "number" },
        ref: { type: "string" },
        tabId: { type: "number" },
      },
      type: "object",
    },
    name: "browser_scroll",
  },
  {
    annotations: { idempotentHint: true, openWorldHint: false, readOnlyHint: true },
    description: "在下一次观察或操作前等待一段有界时间。",
    inputSchema: {
      properties: {
        milliseconds: { maximum: 10_000, minimum: minimumWaitMilliseconds, type: "number" },
      },
      required: ["milliseconds"],
      type: "object",
    },
    name: "browser_wait",
  },
] as const satisfies readonly Tool[];

function toolErrorResult(error: unknown): CallToolResult {
  return {
    content: [{ text: error instanceof Error ? error.message : String(error), type: "text" }],
    isError: true,
  };
}

function* forwardBrowserTool(
  request: CallToolRequest,
  browserBackend: BrowserToolBackend,
): RiteCoroutine<CallToolResult> {
  try {
    const result =
      request.params.name === "browser_session_status"
        ? browserBackend.status
        : yield* browserBackend.execute(request.params.name, request.params.arguments ?? {});
    return {
      content: [{ text: JSON.stringify(result, null, jsonIndentationSpaces), type: "text" }],
      structuredContent: { result },
    };
  } catch (error) {
    if (error instanceof CanceledError || error instanceof ScopeError) {
      throw error;
    }
    return toolErrorResult(error);
  }
}

export function createBrowserSessionMcpServer(
  browserBackend: BrowserToolBackend,
  serviceScope: Scope,
): McpServer {
  const mcpServer = new McpServer(
    { name: "job-boardwalk-browser-session", version: "0.1.0" },
    {
      capabilities: { tools: { listChanged: true } },
      instructions:
        "Browser Session 通过 Patchright CDP 控制 BOSS HTTPS 研究范围内的标签页和通用页面动作。agent 必须根据 browser_snapshot 的有界证据解释页面，并与用户实际看到的窗口核对。URL 位于研究范围不代表登录、投递、发送消息或账号变更获得授权。truncated 表示快照正文、元素或链接被裁剪；快照不返回表单当前值或密码框，元素 ref 仅对最近一次快照有效。遇到登录、验证、凭据、投递、消息或账号变更时，立即停止浏览器输入并让用户接管同一标签页。",
    },
  );
  mcpServer.server.setRequestHandler(ListToolsRequestSchema, () =>
    serviceScope.run(function* listBrowserTools() {
      yield* [];
      return { tools: [...browserTools] };
    }),
  );
  mcpServer.server.setRequestHandler(CallToolRequestSchema, (request) =>
    serviceScope.run(() => forwardBrowserTool(request, browserBackend)),
  );
  return mcpServer;
}
