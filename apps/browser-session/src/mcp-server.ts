import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolRequest, CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { CanceledError, ScopeError } from "@shajara/host";
import type { RiteCoroutine, Scope } from "@shajara/host";
import { platformCatalog, platformIds } from "@job-boardwalk/platform-catalog";

import type { BrowserControl } from "#/browser/browser-control.js";

const minimumWaitMilliseconds = 0;
const jsonIndentationSpaces = 2;
const supportedPlatformLabels = platformIds
  .map((platformId) => platformCatalog[platformId].label)
  .join("、");

const browserTools = [
  {
    annotations: { idempotentHint: true, openWorldHint: false, readOnlyHint: true },
    description: "查看 Browser Session 所管理的可见浏览器状态。",
    inputSchema: { properties: {}, type: "object" },
    name: "browser_status",
  },
  {
    annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
    description:
      "列出或激活受支持招聘平台的标签页，也可按 platformId 准备标签页。action 为 ensure 时优先复用该平台已有标签页。",
    inputSchema: {
      properties: {
        action: { enum: ["list", "ensure", "activate"], type: "string" },
        platformId: { enum: [...platformIds], type: "string" },
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
    description:
      "当用户明确要求登录，或可见页面证据表明当前会话未登录且所请求的流程需要登录时，复用该平台标签页并打开登录界面。此工具只准备用户交接；界面打开后立即停止浏览器输入，由用户填写凭据、扫码或输入验证码，并提交登录。",
    inputSchema: {
      properties: { platformId: { enum: [...platformIds], type: "string" } },
      required: ["platformId"],
      type: "object",
    },
    name: "browser_prepare_login",
  },
  {
    annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
    description: "将现有标签页导航到同一招聘平台内的指定 HTTPS URL；导航范围不授权任何账号操作。",
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
    description:
      "点击最近一次快照中的元素引用。登录交接使用 browser_prepare_login；不得用此工具提交登录、完成验证、投递职位、发送消息或变更账号。",
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
    description: "在最近一次快照的控件中选择选项，仅用于筛选等研究操作；账号变更由用户操作。",
    inputSchema: {
      properties: { ref: { type: "string" }, value: { type: "string" } },
      required: ["ref", "value"],
      type: "object",
    },
    name: "browser_select",
  },
  {
    annotations: { idempotentHint: false, openWorldHint: true, readOnlyHint: true },
    description: "在受支持招聘平台的标签页滚动最多 5000 像素，或滚动到指定元素。",
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
    description: "在下一次观察或操作前等待指定时间，最长 10 秒。",
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
  browserControl: BrowserControl,
): RiteCoroutine<CallToolResult> {
  try {
    const result =
      request.params.name === "browser_status"
        ? browserControl.status
        : yield* browserControl.executeTool(request.params.name, request.params.arguments ?? {});
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
  browserControl: BrowserControl,
  serviceScope: Scope,
): McpServer {
  const mcpServer = new McpServer(
    { name: "job-boardwalk-browser-session", version: "0.1.0" },
    {
      capabilities: { tools: { listChanged: true } },
      instructions: `Browser Session 管理一个可见的 Patchright 浏览器，并通过统一平台适配器控制 ${supportedPlatformLabels} 的标签页；各适配器可以具有不同的自动访问判定能力。调用方必须依据 browser_snapshot 返回的有界证据解释页面，并与用户实际看到的窗口核对。用户明确要求登录，或可见页面证据表明当前会话未登录且所请求的流程需要登录时，调用 browser_prepare_login 主动打开登录界面；打开界面只是在准备用户交接，不授权代理填写或提交凭据、扫码或完成验证码等验证。HTTPS 导航范围只允许研究导航和明确的登录交接准备，不授权投递职位、发送消息或变更账号。truncated 表示快照正文、元素或链接已被裁剪；快照不返回表单当前值或密码框，元素 ref 仅对最近一次快照有效。需要用户操作时，立即停止浏览器输入并让用户接管同一标签页；只有在用户明确交回控制权并重新观察页面后，才能继续。需要页面语义才能得出的登录结论由调用方记录到 Workspace Service；Browser Session 只自动报告适配器能从顶层导航响应确定的观察。`,
    },
  );
  mcpServer.server.setRequestHandler(ListToolsRequestSchema, () =>
    serviceScope.run(function* listBrowserTools() {
      yield* [];
      return { tools: [...browserTools] };
    }),
  );
  mcpServer.server.setRequestHandler(CallToolRequestSchema, (request) =>
    serviceScope.run(() => forwardBrowserTool(request, browserControl)),
  );
  return mcpServer;
}
